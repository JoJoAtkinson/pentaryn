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

- DB-AC-1: a drop onto the canvas is recorded by the active GM user only (Item Piles fires its drop
  hook on every client, so a multi-item drop was recorded once per extra client), and the entry's
  scene is the pile token's scene, not the recording client's view. The entry's user is that GM.
- DB-AC-2: an entry relayed to a GM tab before that tab is `ready` is held and recorded at `ready`,
  in arrival order, and the relay resolves with its ledger number (it called `settings.set` before
  ready and was lost).
- dropbin-EC-4: HUD Revive cancels the debounced sync its own writes queued, and a second sync for
  a token already converting waits for it and then re-checks dead/alive, so a corpse is never
  reverted twice at once (the second revert erased the restored ownership map).
- dropbin-R3: `restore`/`restoreResult` with a target that does not resolve (a typo, an unknown
  UUID) is refused as `no-actor` with the "cannot find an actor" toast; it restored onto the actor
  the item left and reported success. A target may now also be a TokenDocument (its actor) or an
  Actor/Token UUID; only no target falls back to the actor the item left.
- dropbin-EC-2: the tail dedupe also matches the lost item's source `_id` and the entry's
  `pileUuid`, so a second, distinct same-named item lost from the same actor within 2 s is its own
  entry (it was dropped as a duplicate); one event seen on two clients is still one entry. Stored
  entries are unchanged — only the matching rule.
- dropbin-EXT-3: the Item Piles loot-window selectors Loot all uses (footer, Close Lid / Leave
  icons, the native Take All icon) are one frozen `SELECTORS` table exported by `piles.mjs`;
  `loot.mjs` reads them from there. Loot all finds and places its button exactly as before.
- dropbin-perf-1: the corpse eye's "show it?" answer (an Item Piles pile/empty query) is cached
  on the Token as `_pdWantsEye` and recomputed only on drawToken, updateToken, the updateActor and
  item hooks, canvasReady and a direct `corpses.paintEye`; `refreshToken` (every animation frame)
  only places and sizes the eye from the cached answer.

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
