# Pentaryn Drop Bin (`pentaryn-dropbin`)

**Read this when:** an item went missing from a sheet, a dead NPC is or is not lootable, the eye
on a body is wrong, a locked chest opened (or did not), or you are changing or calling
`pentaryn-dropbin`. **Not this file:** how every addon is built → `context/foundry/addon-blueprint.md` ·
the migration record → `context/plans/addon-blueprint-2026-10/migrate-pentaryn-dropbin.md`

Four jobs, one module: **the ledger** (every item that leaves a character, with its full source, so
it can be handed back), **lootable corpses**, the **Loot all** button, and the **Item Piles
patches** the world needs (attunement repair, container locks, directory filters, the in-view rule,
the dnd5e 6 rarity keys).

## What the player sees

**Lootable corpses.**
- **Only the dead can be looted.** An NPC at 0 HP, or carrying the Dead status, becomes a pile the
  players open with the usual double-click, from an adjacent square. Healing it above 0 turns it
  back into a creature. Set `flags.pentaryn-dropbin.noLoot = true` on a token or actor to keep a
  0-HP NPC alive and unlootable (knocked out for questioning).
- **On the body:** the Dead skull as core's **full-body overlay**, and an **eye badge** in the
  token's top-right corner while the body still holds something. Every client draws the eye on the
  token itself; it is not a document. It disappears when the body is emptied or revived, and hides
  with the token (out of sight, under fog, GM-hidden).
- **GM token HUD on a corpse:** *Open character sheet (GM)* (Item Piles otherwise takes over the
  double-click) and *Revive (1 HP)*.
- **Ownership:** players get OBSERVER on the token's own actor delta while it is a corpse (Item
  Piles needs it), never on the base actor. A revival gives back the delta map saved at death
  (none saved: the base actor's again). Sight is off on a corpse and restored on revival.
- **Old corpses** (before October 2026) carried a "Lootable" effect and Dead as a corner icon; the
  active GM's client fixes them at every `ready` (`corpses.migrateLegacyEyes()`, safe to re-run).

**Loot all.** A button in the footer of every Item Piles loot window (piles, containers, corpses,
eye hotspots), next to *Split*. It calls Item Piles' `transferEverything(pile, character)`, which
runs on the GM's client with Item Piles' own filters, chat card and delete-when-empty, and takes
other players' unclaimed shares too. It loots into the window's *inspecting as* actor (follows
Item Piles' *Change*), else the user's assigned character, else their first owned character.
Greyed out with the reason as a tooltip (empty, or no character of their own); not shown on
merchants, vaults, locked or closed containers, for a GM with no character, or when Item Piles'
native *Take All* is already there. **Needs a GM online.**

**Locked containers** stay shut from every door: canvas, Actors sidebar, API and Ctrl-click. A
player hears the lock and reads "<name> is locked." and a floating *Locked*. The GM is exempt.

**Sidebar:** players do not see pile actors in their Actors sidebar, or journals pinned to a scene
Note in their Journal sidebar (a readable is found by looking at it). Handouts stay.

**Unidentified items and the merchant Rarity column** read words, not raw `DND5E.*` keys (dnd5e 6).

The **ledger** is invisible at the table; it is a GM tool (API below).

## Settings

| Key | Scope | Default | What it does |
|---|---|---|---|
| `log` | world, hidden | `[]` | The ledger: every entry, oldest first, each with the item's complete source. |
| `counter` | world, hidden | `0` | The last ledger number handed out. `clear()` keeps it: numbers are never reused. |

Neither is in the settings menu. `assets/drop-bin/drop-log.json` mirrors the ledger for reading
outside Foundry; the world setting is the source of truth.

## API — game.pentaryn.dropbin

Canonical: `game.modules.get("pentaryn-dropbin").api`; `game.pentaryn.dropbin` is the same object,
published at `ready`. Ask it: `game.pentaryn.dropbin.describe()` (offline: `test/golden/describe.json`).

| Method | GM | Writes | Returns |
|---|---|---|---|
| `list(n = 20, { brief })` | — | — | last n entries, newest first; `brief: true` → `{n, iso, reason, itemName, itemType, quantity, fromActorName, sceneName, pileUuid}` (no item source — use it from the bridge) |
| `all()` / `get(n)` / `search(text)` | — | — | the whole ledger / one entry or null / entries whose item name contains text |
| `restore(n, target?)` | yes | Item on the actor | the created Item, or the warn/error Notification it showed |
| `restoreResult(n, target?)` | yes | Item on the actor | `{ ok: true, item, actor }` or `{ ok: false, reason: "not-gm" \| "no-entry" \| "no-actor" }`, no toasts |
| `export()` | yes | the mirror | `true`, or `false` for a player or a failed upload |
| `clear()` | yes | `log`, the mirror | `false` unless confirmed; **keeps the counter** |
| `inspect(ref, { sceneId })` | — | — | a token's (or an actor's tokens') corpse state: `dead, corpse, noLoot, pile, saved {sight, ownership}` |
| `corpses.sync/toCorpse/fromCorpse/revive/migrateLegacyEyes` | yes | see Data written | legacy; run on the active GM |
| `corpses.isDead/paintEye/paintAllEyes` | — | — | legacy |
| `loot.install(app)` / `loot.refreshAll()` / `loot.recipientFor(app)` | — | — | legacy |
| `selftest()` | — | — | `{ ok, checks }` |

`target` is an Actor, an actor id or exact name (default: the actor the item left). `inspect`'s
`ref` is a token (uuid, id or exact name — never a substring) or an Actor. An entry is
`{n, t, iso, reason: "drop" | "delete", userId, userName, fromActorId, fromActorName, fromActorUuid,
itemName, itemType, quantity, sceneId, sceneName, x, y, pileUuid, item}`.

## Data written

| Where | What | Who |
|---|---|---|
| world settings `log`, `counter` | the ledger | a GM client (players relay through socketlib) |
| `Data/assets/drop-bin/drop-log.json` | the mirror, ~2 s after a burst; `export()` at once | the recording GM |
| token `flags.pentaryn-dropbin.corpse`, `.sight`, `.ownership` | our corpse, its sight and pre-death delta ownership | active GM |
| token `delta.ownership`, `sight.enabled`; Item Piles pile flags | while a corpse | active GM |
| actor/token `flags.item-piles.data.lockedSound`; pile `sight.enabled`; Note `global` | ready backfills | active GM |
| ActiveEffect Dead (`flags.core.overlay`) | the corpse overlay | active GM |
| `system.attunement` on items Item Piles creates | the repair (`preCreateItem`, in memory before the create) | the creating client |

## Flags other modules read

n/a — no other module reads `flags.pentaryn-dropbin.*`. This module reads `flags.item-piles.data`
(Item Piles' own; `api-manifest.mjs` `flags.reads`) and its own `noLoot`, set by the GM.

## Events

n/a — emits none of its own beyond the kit's `pentaryn-dropbin.ready` (api) and `pentaryn.ready`.
Listens to the 29 load-time and 6 post-ready hooks pinned in `test/golden/hooks.json` and
`test/golden/hooks-after-ready.json`.

## Patches and adjustments

**Item Piles touch points** (all through `piles.mjs`, except the hook names):
- drop capture: Item Piles' `ITEM.DROP` hook; delete capture asks `isValidItemPile` and `ACTOR_CLASS_TYPE`
- attunement NaN repair (`itempiles.mjs`, `ATTUNEMENT_PACKS` / `repairAttunement`): Item Piles nulls
  `system.attunement` and dnd5e stores "NaN"; looked up by name in the equipment packs. Delete when
  Item Piles preserves it. **Order:** pentaryn-attunement registers `preCreateItem` at load; this
  registers inside an async `ready` after the pack indexes load, so attunement's runs first.
- container locks: `item-piles-preRenderInterface`, `item-piles-preRenderActorSheet` (vetoes) and
  `item-piles-preRattleItemPile` (words only)
- directory hiding: `renderActorDirectory`, `renderJournalDirectory`
- Loot all reads Item Piles' private Svelte state (`app.svelte.appShell.$$.ctx`) to follow *Change*
- corpse piles: `turnTokensIntoItemPiles` / `revertTokensFromItemPiles`
- `i18n-shim.mjs`: `DND5E.ItemRarity*` / `DND5E.Unknown` added at `i18nInit` when missing

Rows in `foundry/adjustments.yml`: `itempiles-corpses`, `itempiles-rarity-i18n`; the socketlib relay
and the four patches above get their own rows (`adjustments-batch.md`, dropbin step 10).

## Two sessions / who writes

- **Ledger:** players relay through socketlib (`executeAsGM`) to a GM; a GM records locally.
  Appends on one client are serialised and coalesced (one counter + log write per burst). Two GM
  tabs on the responsible account both receive a relay and both record it; they compute the same
  row, and the tail dedupe (same item, actor, quantity within 2 s) catches the sequential case.
- **Corpses:** conversion, revival and the legacy migration run where `activeGM.isSelf` — every
  tab of the active GM account (see the wave-2 report, W2-D1).
- **Ready backfills** (lock sounds, in-view rule): the active GM user — every tab on that account
  (W2-D1); the writes are idempotent.
- **Locks, directory filters, the eye, Loot all:** each client, for itself.

## Extending

1. A pure rule → `dropbin-core.mjs` (or `ledger-core.mjs` / `loot-core.mjs`) with a table in `test/core.test.mjs` or a new test file.
2. Another Item Piles patch → `itempiles.mjs` (or a new feature file in the entry's list), every
   `game.itempiles` touch through `piles.mjs`, and its own `adjustments.yml` row.
3. An API method → a row in `api-manifest.mjs` + an impl in `api.mjs` over `ctx.exposed`, then
   `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review the golden diff.

## Pitfalls

- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync`.
- `module.json` is read at Foundry startup: any change to it needs a restart, not a reload.
- Never run `GOLDEN_UPDATE=1 node test/run.mjs` mid-refactor — a refactor must not move a golden.
- The entry installs features synchronously in a fixed order; moving one reorders listeners
  against other modules (`golden/hooks.json`).
- `restore()` returns a Notification on refusal; scripts want `restoreResult()`.
- `list()`/`all()` carry every item's full source: use `list(n, { brief: true })` from the bridge.

## Files

| File | Role |
|---|---|
| `dropbin.mjs` | entry (esmodules[0]): wiring, load order, publish |
| `dropbin-core.mjs` | pure barrel: constants, pile flags, backfill planners |
| `ledger-core.mjs`, `loot-core.mjs` | pure ledger rules; pure Loot all / eye rules (`MODULE` lives here) |
| `settings.mjs` | SETTINGS store rows, readLog, the serialised appendLedger |
| `piles.mjs`, `socketlib-adapter.mjs` | adapters: Item Piles, socketlib |
| `ledger.mjs`, `itempiles.mjs`, `corpses.mjs`, `loot.mjs`, `i18n-shim.mjs` | features |
| `api-manifest.mjs`, `api.mjs` | API rows; implementations, inspect, selftest |
| `lang/en.json`, `lib/` | strings; vendored kit |
| `test/` | node:test suites, goldens, fixtures, vendored test kit, the legacy suite |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check dropbin
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module dropbin
```

## Sync

`.mjs` and `lang/` changes need a reload; `module.json` needs a restart. Check what is live with
`game.pentaryn.dropbin.describe().version` and `game.pentaryn.dropbin.selftest()`.
