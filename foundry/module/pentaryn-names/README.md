# Pentaryn Token Name Sync (`pentaryn-names`)

**Read this when:** token labels didn't follow an actor rename, or you are changing or calling
`pentaryn-names`. **Not this file:** how every addon is built → `context/foundry/addon-blueprint.md` ·
how this module was migrated → `context/plans/addon-blueprint-2026-10/migrate-pentaryn-names.md`

Renaming an actor renames its token labels to match: the prototype token and every placed token of
that actor, on every scene — and, on a GM client, its combatants in every encounter. Renaming an
unlinked token's own actor (its synthetic actor) renames only that token. Exposes
`game.pentaryn.names`.

## What the player sees

Foundry keeps an actor's name and its token labels separate on purpose, so token nicknames are
possible. This keeps that, with one rule:

- A label that **was the old actor name**, or **the part before its first comma**
  (`Glubbek` for `Glubbek, Kuo-toa Net-Mender`), follows the rename in the same form.
- Any other label is a **deliberate nickname** and is never touched.
- The combat tracker follows too: a combatant of that actor whose name was the old name (or its
  short form) gets the new one in the same form; a custom combatant name is left alone. Only when a
  GM renames — Foundry does not let a player change a combatant's name.

Runs on the client that made the rename (a player renaming their own PC updates only tokens they
can edit). A toast reports how many labels changed: `Token labels updated to "Rob" (3).`

## Settings

n/a — none.

## API — game.pentaryn.names

Canonical: `game.modules.get("pentaryn-names").api`; `game.pentaryn.names` is the same (frozen)
object. Ask it what it offers: `game.pentaryn.names.describe()` (offline: `test/golden/surface.json`).

| Call | Returns | Notes |
|---|---|---|
| `sync(actorRef, oldName, newName)` | number of labels changed (prototype + placed tokens this user can edit) | writes. On a GM client it also relabels the actor's combatants by the same rule (not counted, not toasted). `actorRef`: an Actor, a token or placeable, a UUID, an id or a whole name (exact, then case-insensitive; never a substring); a token or a token's synthetic actor means its base (world) actor. An ambiguous name returns `{ok: false, code: "AMBIGUOUS", reason}`; a ref that is not an actor, token, placeable or string (a number, a plain object, an Item) returns `{ok: false, code: "BAD_ARGS", reason}`, writing nothing, and so does a missing or non-string `oldName`/`newName`; a ref that matches nothing rejects with a `TypeError` |
| `relabel(label, oldName, newName)` | the new label, or `null` for a nickname | pure preview, safe to call |
| `shortName(name)` | the part before the first comma, trimmed | pure |

Renaming through `actor.update({name})` already relabels on the renaming client — an eval-js call on
the GM bridge is that client — but without waiting: `await actor.update({name})` resolves while the
prototype and scene writes are still in flight. A `sync()` called before they finish sees the old
labels and repeats them (same values, a non-zero count and a second toast). Call `sync` only to
repair labels that missed a rename, after the first relabel has finished.

Kit members: `describe()`, `version`, `contract`, `settings()` (always `{}`), `trace()`, `uninstall()`.

## Data written

The prototype token name (`prototypeToken.name`, written with `{pentarynNames: true}` so it does not
re-enter), placed token names (`Scene#updateEmbeddedDocuments("Token", …)`) and, on a GM client,
combatant names (`Combat#updateEmbeddedDocuments("Combatant", …)`, one batch per combat). No flags.

## Flags other modules read

n/a — writes no flags.

## Events

n/a — emits none except the kit's `pentaryn-names.ready` / `pentaryn.ready` on publish.
Listens to: `preUpdateActor` (remember the old name), `updateActor` (relabel) — pinned in
`test/golden/hooks.json`.

## Patches and adjustments

n/a — patches nothing.

## Two sessions / who writes

The renaming client records the old name in `preUpdateActor` (pre-hooks run only there), keyed
by actor id, so a batch rename of several actors gives each its own old name (names-ac-2); it
travels in the update options. Only that client (`userId === game.user.id`) writes, and it skips tokens it cannot edit
(`canUserModify(game.user, "update")`). Combatants are written only when that client is a GM
(`game.user.isGM`, Assistants included): a player's rename relabels its tokens but leaves the tracker.
A GM rename runs in every tab of that GM (the MCP bridge tab and a browser tab both pass the
initiator gate); both send the same names, so the second write changes nothing. A failed write is logged as
`pentaryn-names | relabel after rename failed` with `{actor, from, to}` and the error; no toast.

## Extending

1. A pure rule → `names-core.mjs`, with a row in `test/fixtures/tables.mjs` (the oracle golden
   `test/golden/oracle.json` pins every row for both the oracle and the core).
2. A new API method → a row in `api-manifest.mjs` and its implementation in the entry's `buildApi`
   map; a missing one throws at load.
3. A feature → a file exporting `install(reg, ctx)` / `uninstall()`, listed in `FEATURES` in `names.mjs`.

## Pitfalls

- Unlinked tokens carry the base actor's id, so renaming a base actor relabels **every** unlinked
  token of it whose label matches — two `Goblin` tokens both become `Goblin Boss`. This is intended
  (N-L1, Joe 2026-10-11): a base-actor rename is a rename of the creature, so its copies follow; give
  one a nickname first to keep it apart.
- Renaming an unlinked token's **synthetic** actor (from that token's sheet) relabels only that
  token and, on a GM client, its combatants; its siblings and the base actor's prototype token are
  left alone, and the toast counts that one token (names-edge-1, Joe 2026-10-12).
- A combatant whose name Foundry derived from its token (empty source name) is written the new
  name explicitly: Foundry prepares that name once and a token rename does not re-prepare it, so
  without the write the tracker keeps the old label until reload (PT3-9). From then on the
  combatant stores its name — a later rename of the token alone (Token config, not an actor
  rename) does not reach it.
- Quirks pinned as-is: an old name that is only a comma tail (`",x"`) has short form `""`, which an
  empty label matches; a padded old name (`" Bob "`) has a trimmed short form that differs from it,
  so `"Bob"` follows it.
- `sync` given a token, placeable, token id/uuid or a token's synthetic actor works on the **base**
  actor: a synthetic actor's update goes to its ActorDelta, which has no prototype token, so the
  prototype relabel would be lost. Its placed-token pass covers every token of that base actor.
- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync names`.
- `module.json` is read at Foundry startup: any change to it needs a restart, not a reload.
- Never run `GOLDEN_UPDATE=1 node test/run.mjs` mid-refactor — a refactor must not move a golden.

## Files

| File | Role |
|---|---|
| `names.mjs` | entry (esmodules[0]): wiring, publish |
| `names-core.mjs` | pure constants and rules: `shortName`, `relabel`, `planTokenRelabels` |
| `api-manifest.mjs` | pure data: the three legacy API rows |
| `rename.mjs` | the feature: the two actor hooks and `sync()` (tokens, then GM-only combatants; a synthetic actor's own token only) |
| `lang/en.json` | the toast text |
| `lib/` | vendored kit (`lib/kit.lock.json`) |
| `test/` | node:test suites, goldens, fixtures (`legacy-names.mjs` is the verbatim oracle), vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check names
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module names
```

## Sync

`make foundry-names-check` / `make foundry-names-sync`. `.mjs` and `lang/` changes need a reload
only; `module.json` needs a restart. Check what is live with `game.pentaryn.names.describe().version`.
