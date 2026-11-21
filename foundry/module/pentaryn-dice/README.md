# Pentaryn Dice (`pentaryn-dice`)

**Read this when:** you are changing or calling `pentaryn-dice`. **Not this file:** use-doc → `context/foundry/dice.md` · design → `context/plans/dice-2026-11.md` · how every addon is built → `context/foundry/addon-blueprint.md`

Helpers for Dice So Nice's **persistent dice** (the physical-style dice you put on the table from the Dice So Nice sidebar tab, pick up and throw). Dice So Nice spawns them one at a time and selects them only with Ctrl+click, one by one; this module makes a big roll a few clicks. It changes none of Dice So Nice's files.

## What the player sees

In the Dice So Nice sidebar tab (only while Dice So Nice's *Persistent dice* setting is on):

- **On every die row** (D4 … D20, D100, and the extras behind "Show more"): a count box, a **+ ×** button that puts that many dice on the table in one click (type 8 on the D6 row → 8d6), and a select button that selects all of *your* dice of that type. A D100 spawns and selects as its linked tens + units pair, as Dice So Nice's own **+** does.
- **Above "Clear my dice"**: **Select all mine**, **Clear selection**, and the hint Dice So Nice keeps behind its Help toggle: Ctrl+click selects one die; the shortcut selects all of yours; grabbing one selected die moves and throws them all; Delete removes them.
- **Alt+A** (Configure Controls → Pentaryn Dice → *Select all my dice*) selects all your dice. With none of your dice out it does nothing and passes the key on. Not Ctrl+A: that is Foundry's select-all-tokens.

Selecting adds to the selection (Select all D6, then Select all D8 selects both). Other players' dice are never selected, nor a die Dice So Nice holds for someone's pending interactive throw.

## Settings

| Key | Scope | Default | What |
|---|---|---|---|
| `enabled` | client | on | the count boxes, buttons, hint and shortcut in this browser. Read live; the tab redraws on change |

Keybinding: `selectAll`, default Alt+A, rebindable per user.

## API — game.pentaryn.dice

Canonical: `game.modules.get("pentaryn-dice").api`; `game.pentaryn.dice` is the same object. Ask it what it offers: `game.pentaryn.dice.describe()` (offline: `test/golden/describe.json`). Everything acts for the calling client's user.

| Call | Returns |
|---|---|
| `spawn({ type, count, dryRun })` | `ok({ requested, spawned, stopped })`; `fail("BAD_ARGS")` for a non-die, `fail("NOT_READY")` without persistent dice |
| `selectMine({ type })` | how many dice are selected now |
| `clearSelection()` | how many were selected |
| `status()` | `{ enabled, dsnActive, persistentDice, mine, selected, shortcut, internals }` |
| `selftest()` | `{ ok, checks }`: the six Dice So Nice internals (below) |

## Data written

n/a — the module writes nothing of its own. `spawn` goes through Dice So Nice's `persistent.spawn`, which broadcasts the die and saves it to Dice So Nice's own user flags, exactly as its **+** button does. Selection is client-local Dice So Nice state.

## Flags other modules read

n/a — no flags.

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-dice.ready` | `(api)` | the API is published |

Listens to: `renderDsnSidebarTab` (pinned in `test/golden/hooks.json`).

## Patches and adjustments

No patches. Two rows in `foundry/adjustments.yml`:

- `dsn-persistent-dice-select` — the internals: `game.dice3d.persistent.spawn` and the box's `persistentDiceManager` (`selectedPersistentDiceIds`, `togglePersistentSelection`, `clearPersistentSelection`, `getSelectedPersistentDice`, `countPersistentDiceByOwner`, plus `persistentDiceList` and `onSelectionChanged`). None is a documented API; `selftest()` checks the six the plan names. All of it lives in `dsn-adapter.mjs`.
- `dsn-sidebar-tab-dom` — the DOM added on `renderDsnSidebarTab`: `li.dsn-toolbox-dice-row[data-type]`, `.dsn-toolbox-dice-buttons`, `section.dsn-toolbox-clear`.

`dice-so-nice` is under `review_always` in `foundry/update-policy.yml`, so a Dice So Nice update always goes to the adjudicator.

## Two sessions / who writes

Per client. A spawn is broadcast by Dice So Nice itself; the selection never leaves the browser. No GM work, no queries, no socket.

## Extending

1. A pure rule → `dice-core.mjs` with a fixture in `test/core.test.mjs`.
2. Anything new on `game.dice3d` → `dsn-adapter.mjs` only, plus its name in core `INTERNALS` if `selftest()` should check it.
3. The box select on the dice board (plan M3) was left out of 0.1.0.

## Pitfalls

- Dice So Nice re-renders its whole tab on every persistent-dice change (each spawned die), so the helpers are re-added on each render; `decorate()` is idempotent, and the typed counts live in a session map.
- Our buttons carry no `data-action`: Dice So Nice's AppV2 action delegation must never see them.
- Spawn one die at a time: Dice So Nice lays each die out by how many are already on the table.
- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync`.
- `module.json` is read at Foundry startup: any change to it needs a restart, not a reload.

## Files

| File | Role |
|---|---|
| `dice.mjs` | entry (esmodules[0]): wiring, load order |
| `dice-core.mjs` | pure: INTERNALS, spawnGroups, idsToSelect, bindingLabel, statusOf |
| `settings.mjs` | SETTINGS / KEYBINDINGS |
| `dsn-adapter.mjs` | the only file touching `game.dice3d` |
| `api-manifest.mjs`, `api.mjs` | API rows and implementations |
| `sidebar.mjs` | the feature: the tab helpers and the shortcut's handler |
| `lib/` | vendored kit (`lib/kit.lock.json`) |
| `test/` | node:test suites, goldens, fixtures (a synthetic Dice So Nice and DOM), vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check dice
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module dice
```

## Sync

First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Dice' (`core.moduleConfiguration["pentaryn-dice"] = true`), reload. After that `.mjs`, `.css` and `lang/` changes need a reload only. Check what is live with `game.pentaryn.dice.describe().version` and `game.pentaryn.dice.selftest()`.
