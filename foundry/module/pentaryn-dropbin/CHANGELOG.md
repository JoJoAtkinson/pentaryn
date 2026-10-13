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
- dropbin-R4: with no target, an item that left an unlinked token is restored onto that token's
  own (synthetic) actor while the token still exists; it went to the base actor in the sidebar.
  Once the token is gone it falls back to the base actor.
- dropbin-R5: `restoreResult` never rejects. A create that throws (a server or validation error)
  or an entry with no item source is `{ok: false, reason: "not-created"}`, the throw logged once as
  `pentaryn-dropbin | restore #n failed`; it rejected with the raw error, and `restore()` showed no
  toast. `restore()` now shows the "was not restored" error toast for both.
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
- dropbin-R9: the 'Locked' float goes on the chest the player tried: the hook's own token, else a
  synthetic actor's token, else the first token holding that same actor object. It matched by actor
  id, so with two unlinked chests of one base actor it could float over the other chest; no match is
  no float (the toast still shows).
- dropbin-M6: the two lock vetoes (`item-piles-preRenderInterface`, `item-piles-preRenderActorSheet`)
  are one `refuseIfLocked(target)`, registered twice with the same labels in the same order; a player
  is refused a locked container exactly as before.
- dropbin-R6: `corpses.toCorpse`/`fromCorpse`/`sync` return early with one console warning
  (`pentaryn-dropbin | corpses.<fn>: …; nothing done`) when Item Piles is not active or the argument
  is not a TokenDocument (`sync`: an Actor); they threw raw TypeErrors. A failed corpse-flag write in
  `toCorpse` reverts the pile it just made and rejects, instead of leaving a pile no revival undoes.
  Without Item Piles the hp/effect hooks no longer queue a sync at all.
- dropbin-EC-3 (Joe, 2026-10-12: "Just loot, they can't open the char sheet"): a dead **linked**
  NPC is now lootable. Its token ignores `delta.ownership`, so players never got the OBSERVER Item
  Piles needs and the pile would not open; its base actor now gets `ownership.default: OBSERVER`
  while it is a corpse, the pre-death map saved in the actor's `corpse`/`ownership` flags at the
  first death and written back on revival. No player opens any corpse's actor sheet by any route
  (Ctrl-double-click bypass, sidebar, links, `bypassItemPiles`): `item-piles-preRenderActorSheet`
  vetoes it and a forced open shows the loot window instead; unlinked corpses' sheets were reachable
  through the Ctrl bypass too. One more load-time hook (30).
- dropbin-EC-3 repair: the corpse sheet veto opens nothing itself and always vetoes. It called Item
  Piles' `renderItemPileInterface` before `return false`; that API throws synchronously on a body
  whose pile was reverted, the hook runner swallowed the throw and the full sheet opened. On a live
  pile it skipped Item Piles' `distance: 1` check, so a Ctrl-double-click looted a body across the
  map. A linked corpse's base actor gets its saved map back (and loses our flags) once its last
  corpse token, or that token's scene, is deleted, and at every `ready` for any such actor left
  over; before, clearing a body off the map left players OBSERVER on the NPC. Three more load-time
  registrations (`deleteToken`, `deleteScene`, a `ready`; 33).
- dropbin-R7: a failed HUD *Revive* is one console warning
  (`pentaryn-dropbin | revive failed for <token>`) and one warn toast ("Could not revive <token>. See
  the console."), and the HUD stays open; it was an unhandled, unprefixed rejection with nothing on
  screen.
- dropbin-R8: a failed eye-texture load (missing file or a rejected load) is remembered; no eye
  shows and the console warns once per attempt, and the load is tried again only on the next
  `canvasReady`. It was retried, and warned, on every eye paint (every animation frame).
- dropbin-R10: a malformed relayed ledger entry (not an object, a reason other than `drop`/`delete`,
  a non-string `itemName`, a non-numeric `t` or `quantity`, an `item` that is neither null nor an
  object) is one console warning (`pentaryn-dropbin | malformed ledger entry ignored`) and resolves
  null; it is never appended. One entry that fails to append rejects only its own caller, and the
  rest of its coalesced batch is still written; it rejected the whole batch before.
- DB-AC-3: a relayed ledger entry whose `userId` is not an existing user, or names a player who
  does not own the actor it left (when that actor still exists), is refused: one console warning
  (`pentaryn-dropbin | ledger entry refused: …`), resolves null, never appended. Any client could
  append an entry in another user's name before. socketlib gives the relay no sender, so this is a
  plausibility check; forging past it needs the console.
- DB-AC-4: `corpses.sync` converts all of an actor's eligible tokens in one batch: one
  `turnTokensIntoItemPiles` (or `revertTokensFromItemPiles`) call for all of them, then each token's
  flag writes, then Dead as the overlay once per distinct actor (a linked NPC's base actor's map is
  put back once). It made one Item Piles call and one Dead toggle per token before. A failed token
  is still one `corpse sync failed for <name>` warning and the others go on; single-token syncs
  are unchanged.
- dropbin-EC-5: `corpses.sync` finds an actor's tokens on every scene (`getDependentTokens`), so a
  linked NPC killed while the GM views another scene becomes a corpse there too (and revives
  there); it saw only the viewed scene's tokens before. Only tokens a scene really holds
  (`concreteOnly`, as `getActiveTokens` and dnd5e): an unpersisted clone such as a Token Config
  preview is skipped, so it can no longer fail the whole Item Piles batch with the real token.
- dropbin-EC-6: `corpses.toCorpse` (and `sync`) on a token that is already our corpse pile re-writes
  its OBSERVER map (`delta.ownership.default`, an unlinked token) and `sight.enabled: false` when
  either was lost; it returned at the pile check before, so a lost write left players without the
  loot window. The saved flags and everything else are untouched.
- dropbin-EC-9 (kept, now documented): `inspect('<name>')` when several tokens share that name
  throws `AMBIGUOUS` (the bridge relies on the code); by name a token wins, so pass the token
  uuid/id, an `opts.sceneId`, or the actor. The inspect row now declares its optional
  `opts { sceneId? }` param (M8); describe.json regenerated.
- dropbin-EXT-5: Loot all's last fallback recipient (a player's first owned character) is an actor
  of Item Piles' character type (`ACTOR_CLASS_TYPE`), as the ledger's delete capture uses; it
  hard-coded `character` before, so in a system with another character type it found none.
  `character` is used only when Item Piles is absent.
- dropbin-EXT-8: the corpse eye loads `modules/pentaryn-dropbin/assets/icon-eye.webp`, shipped in
  the module; it loaded `assets/tokens/custom/props/icon-eye.webp` from one world's Data folder, so
  any other world showed no eye on a lootable corpse.
- dropbin-M13: the manifest's row helper is `legacyRow` (was `corpseRow`; it builds the `loot.*`
  rows too). Rename only — `describe()` and every row are unchanged.
- dropbin-M12: `socketlib-adapter.mjs` is the only file that touches `socketlib`; the ledger's
  hot-reimport branch asks the adapter's `socketlibPresent()` (was a direct `globalThis.socketlib`
  probe). No behaviour change.
- dropbin-EXT-7: `i18n-shim.mjs` exports `LITERAL`, and a test asserts it names exactly the keys of
  `LEGACY_KEYS` (a legacy key with no literal word would have filled `undefined`). No behaviour change.
- dropbin-R1: `list(0)` (and `listLast(log, 0)`) is `[]`; it returned the whole ledger
  (`slice(-0)` is `slice(0)`). Only `0` changes: every other `n` gives the same answer as before.
- dropbin-M5: `corpses.isDead` always returns a boolean, as the manifest says: a missing actor (or
  one with no `statuses`) is `false`; it returned `undefined`. The live golden reads `isDead(null)`
  under `golden.declared.isDeadNull` now (`"false"`; was `"undefined"` in `golden.shared.isDead`).
- dropbin-R2: `list(n, null)` is `list(n)`; it threw a destructuring TypeError. Only `null` opts
  changes: `undefined`, `{}` and `{ brief }` give the same answer as before.

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
