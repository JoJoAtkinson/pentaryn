# Changelog — Pentaryn Drop Bin (`pentaryn-dropbin`)

## 0.2.3 — 2026-10-11 (wave 2 live check, PT3-1 again)

- A revived corpse clears its OBSERVER map with a `ForcedDeletion` (then writes a saved per-token
  map on top), never a plain `null`. Foundry 14.369 can drop a delta write on the server after
  broadcasting it, so the server may already hold `null` while every client shows the corpse's
  `{default: OBSERVER}`; a plain `null` was then no change, nothing went out, and players kept the
  revived NPC's sheet until they reloaded (about 4 trials in 7). The corpse flags go by
  `ForcedDeletion` too (the `-=` keys are deprecated in 14).

## Unreleased — 2026-10-11 (migrated to the addon blueprint, wave 2)

Structure (no behaviour change): the 520-line `dropbin.mjs` becomes a wiring-only entry; pure
`ledger-core.mjs` and the `dropbin-core.mjs` barrel; `settings.mjs`; the `piles.mjs` and
`socketlib-adapter.mjs` adapters; the `ledger` and `itempiles` features beside `corpses`, `loot`
and the i18n shim, each with `install`/`uninstall`; the API through `api-manifest.mjs` and the
vendored kit (1.0.2, full tier); user-facing strings in `lang/en.json`; `node:test` suites.

Declared changes:

- journal-EXT-9: the pinned-journal rule that hides eye readables from the players' sidebar is the
  kit's null-safe one (`lib/pins.mjs`, kit 1.2.0, shared with journal); a scene without notes no
  longer breaks the player's Journal sidebar render.
- Hook handlers report through the kit guard: a throwing handler is logged as
  `pentaryn-dropbin | <label>`, a rejected async one too (was Foundry's report / an anonymous
  unhandled rejection).
- D-D1: the API is published at `ready` (was a tick later), frozen, also on `module.api`; adds
  `describe`, `version`, `contract`, `settings`, `trace`, `uninstall`.
- D-D2: ledger appends on one client are serialised; concurrent drops are numbered consecutively
  (could share a number or lose a row) — items-journal-18.
- An entry that cannot be recorded (no GM online, a failed write) is one console warning, and a
  revived corpse's Dead toggle failure warns — items-journal-21.
- Item Piles' pile data is read as plain flags; with Item Piles inactive the sidebar filter, the
  lock hooks and the GM backfills no longer throw — items-journal-23.
- The ready backfills run on the active GM user only (every tab on that account; a second GM user
  no longer backfills), actors written in one batch — items-journal-25.
- The corpse eye redraws its disc only when its size changes; players' clients queue no corpse
  sync timers — items-journal-30.
- Ledger writes during a burst are coalesced; the JSON mirror is written ~2 s after the burst
  (`export()` at once); the GM's ready line adds the ledger size — items-journal-19.
- `clear()` empties the log in the same queue as appends: an append in flight cannot write the
  old log back over the clear, and an append asked for after the clear lands after it (§5.9).

Added: `list(n, { brief })`, `restoreResult`, `inspect`, `selftest` (items-journal-28).
- A restore another module refuses (a `preCreateItem` veto) is `{ ok: false, reason: "not-created" }`
  from `restoreResult` and an error toast from `restore()`, which threw a TypeError before.
Performance: the Journal sidebar filter walks the scenes' notes once per render (items-journal-24).

## 0.2.2 — 2026-10-11 (play-test fix)

- PT3-1: a revived corpse gives back its delta ownership (the update was recursive, so every
  player kept OBSERVER on the revived creature's sheet); a re-piled corpse keeps the map saved at
  its first death.

## 0.2.1 — 2026-10-10

- dnd5e 6: the Item Piles i18n shim (`DND5E.ItemRarity*`, `DND5E.Unknown`).

## 0.2.0 — 2026-10-10

- Lootable corpses with the drawn eye and the GM HUD (`corpses.mjs`); the Loot all button
  (`loot.mjs`, `loot-core.mjs`); the in-view rule (piles never see, readable pins not global).

## 0.1.0 — 2026-08-21

- The ledger: Item Piles drops and sheet deletes, restore, the JSON mirror; the Item Piles
  attunement repair, container lock enforcement and lock sounds, directory filters.
