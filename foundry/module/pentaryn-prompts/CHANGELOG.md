# Changelog — Pentaryn Prompt Markers (`pentaryn-prompts`)

## 0.4.6 — 2026-10-17

`place(sizeKey, { ticket, at })` takes an optional `at` (canvas coordinates): the marker is centred
there instead of under the cursor. The pentaryn-pins GM canvas menu's **Prompt note** passes the
point that was right-clicked. The P key passes no `at` and is unchanged. Test: `place-at.test.mjs`.
Restart (module.json).

## Unreleased — blueprint migration (wave 3, 2026-10-11)

`module.json` stays 0.4.5 until the Wave 7 restart batch adds `flags.pentaryn` (tier, namespace,
cssPrefix `pp-`, afterSync). Each **[declared]** change goes to the live check.

- **[declared] The API is kit-built** (DP1, DP2): published synchronously at `ready` (no timer) on
  `game.modules.get("pentaryn-prompts").api` and `game.pentaryn.prompts`, frozen, with
  `describe()`/`version`/`contract`/`settings()`/`trace()`/`uninstall()` beside the twelve calls it
  had; it fires `pentaryn-prompts.ready` and `pentaryn.ready`. New reads: `inspect(ref)`,
  `markersOn(sceneId)`, `manifest(call)`, `selftest()` (prompts-lookup-19).
- **[declared] The queries come from the manifest through the kit** (DP3): same five names, same
  payloads (`toPlain` is a no-op on them), same `NOT_GM` messages; a query before the API is
  published answers `NOT_READY`.
- **[declared] The double-click wrap carries a marker** (DP4): a hot re-import no longer stacks a
  second wrap.
- **[declared] Window blur clears held type-ahead keys** (DP5): a key released while the window was
  away no longer eats that key's next release.
- **[declared] `replaceMany({replacements: <not an array>})` rejects `BAD_SPEC`** (DP6), not a
  bare `TypeError`.
- **[declared] Crop images load under a route prefix** (DP7); `data:`/`blob:` sources are fetched
  as they are.
- **[declared] The hover tip reuses a cached scene model** until the scene changes (DP8); the side
  panel still builds fresh, gather never uses the cache. Its count skips the door/wall pass
  (prompts-lookup-7).
- **[declared] The side panel follows a rename** (PT 2026-10-12, the DP8 live check): an
  `updateToken` that changes a token's `name` or `texture` redraws the open panels, so renaming an
  actor in view (core renames its linked tokens with a name-only update) shows the new name.
- **[declared] The side panel follows a ring or prompt edit** (EC-1): an `updateToken` that changes
  a token's `ring` or its `flags.pentaryn-prompts.prompt` redraws the open panels too, so a
  ring-subject swap, or a prompt edit saved without a nameplate change, shows at once.
- **[declared] The side panel follows note edits, lights and tiles** (M1): `updateNote` and the
  create/update/delete hooks for `AmbientLight` and `Tile` redraw the open panels too (the panel
  lists provenance lights and tiles as rows), as the README already said; the 250 ms debounce
  bounds the cost.
- **[declared] A patch's fractional CR** (`"1/2"`) is written as 0.5, not `NaN`, so a real run's
  encounter XP matches its dry run.
- **[declared] A bad `patch.disposition` word** (`"angry"`) is refused by the dry run too (R2):
  `BAD_SPEC: patch.disposition: hostile|neutral|friendly|secret`, checked after every other patch
  field so a second bad field keeps its own message. The real run now refuses it at plan time, so
  nothing is imported, copied or stamped first (no cleanup line, no `discarded` entry).
- **[declared] The dialog's side panel escapes with `foundry.utils.escapeHTML`** (M17), as the tip
  does, instead of a private helper: an apostrophe now reads `&#x27;` in the panel's HTML. Every
  panel attribute is double-quoted, so this is consistency, not a hole; nothing changes on screen,
  and the `dialog-panel` golden (no apostrophe in its fixture) is byte-identical.
- **[declared] `markerActorIds` is retired from `markers-adapter.mjs`** (M16): nothing called it;
  `markerActor(size)` still finds each of the six, and `api.status()` lists them through it.
- **[declared] The type-ahead orphan toast is localised on every path** (M12): the adapter's
  no-sink fallback reads `PENTARYN_PROMPTS.typeahead.orphan` through `_loc`, as the entry's sink
  does; English is only the fallback where `_loc` is undefined (node). No change in English.
- **[declared] A choice pool entry that fails to load reads as its uuid** (M10): an ItemChoice
  pool entry whose `fromUuid` rejects (a locked or broken pack) is named by its uuid in the real
  run's matching and `DEFAULTED` line, as the dry run already did, instead of throwing the build
  mid-advancement.
- **[declared] A spell listed twice in one call is added once** (EC-7): `spells` or `spellbook`
  naming the same spell twice gives one copy and the warning `<spell> listed twice — added once`,
  in the dry run's preview and the real run alike.
- **[declared] A misshapen patch field is refused by the dry run** (R3): `removeItems` must be a
  list of item names or ids, `itemUpdates` a list of `{item, set: {...}}`, `set` an object of
  paths, `hp` a number or `{max, formula}`, and `ac`, `cr` (fractions allowed) and `speed` must
  read as numbers. Each `BAD_SPEC` names the shape wanted; a valid patch runs as before.
- **[declared] A failed save never deletes a marker's words** (R1): a fresh marker whose text did
  not save stays on the scene (red tint, the save-failed toast) instead of being removed as empty,
  and a size chip whose save failed does not swap, so the swap never carries stale text.
- **[declared] A double click on a size chip swaps once** (EC-2): one click makes exactly one new
  marker and one delete. The chips grey out (`pp-swapping`) while a swap runs and further clicks
  are ignored; closing the box or Delete waits for the swap, so the closing save lands on the new
  marker and Delete removes it rather than leaving an orphan.
- **[declared] A size swap stops when its marker goes** (R4): a marker deleted elsewhere (another
  tab, a replace) while a size chip is swapping it no longer gets a new marker made; if the new
  marker was already created, it stays in place with the text, and the gone marker is not deleted a
  second time.
- **[declared] Keys typed during a size swap are kept** (EC-4): the new marker is made with the
  text as it stands at the end of the swap, the box redraws with exactly what was typed, and an
  autosave follows so anything typed mid-swap lands on the new marker (it used to snap back to the
  text from when the chip was clicked).
- **[declared] One box per marker, even when reopened mid-save** (EC-6): two opens of a marker
  whose box is still saving (Esc, then straight back in, twice) now share one box instead of each
  making their own.
- **[declared] A second open in the same tick no longer throws** (EC-6 live, FIX-3 2026-10-13): a
  fast double-click or Shift+P twice on one marker used to reject the second open with a
  `TypeError` (core's `bringToFront` on a box not yet rendered). The box is only brought forward
  once it has rendered; both opens get the one box.
- **[declared] The manifest's `returns` strings match what crops and model return** (EXT-3): crops
  names `mimeType` and the error row's `scene` (`{encounter, scene, error}`), and model names `nav`.
  `test/ext3-returns.test.mjs` compares each row's key list with a real sample (the `crop-row`
  golden, a renderCrops error row, a stub scene model), so the next drift fails the gate; the
  `describe` golden is re-pinned. No behaviour change: only describe()'s text differs.
- **[declared] Hex crops box each token's real footprint** (EXT-12): crops take the token box and
  art from the scene model's exported `footprintRect` (core's `Token#getSize`, else width × grid),
  `tokenImg` (the ring subject when the ring is on) and `EYE` (a note with no icon), so on a hex grid
  the crop draws the same rect the gather measures. Square-grid crops are unchanged (the crop
  goldens are byte-identical); `glue-exports` is re-pinned for the three new exports.
- **[declared] A failed Delete leaves the box open and still saving** (prompts-U1): the box counts
  as deleted only once `tok.delete()` lands. Before, a rejected delete left the box open but every
  later save was skipped, so words typed after it were lost. A rejection now logs, shows "The prompt
  marker could not be deleted; see the console." (`PENTARYN_PROMPTS.dialog.deleteFailed`), and the
  box stays editable; the deleteToken hook still leaves a box whose own delete succeeded alone.
  While the delete is in flight the box counts as going away: a second Delete click, a size chip
  or Esc does not issue another delete or make a new marker (Esc waits, then saves only if the
  delete failed); a failed delete reschedules the autosave; and a delete that fails because the
  marker went elsewhere meanwhile closes the box quietly.
- **[declared] Two gathers at once keep both manifests**: the ring writes through one
  `serialStore` (a parallel gather no longer makes the other's call id `CALL_UNKNOWN`).
- **[declared] `ensureMarkers` no longer duplicates across two GM tabs** (§5.9.1): the folder and
  each marker actor are created with a fixed id (`pPromptsFolder00`, `pPrompts<size>` padded to
  16) and `keepId`, so when the bridge tab and a GM browser tab both find one missing, the second
  create replaces the first instead of adding a second `Prompt Markers` folder or `Prompt · <size>`
  actor. A folder holding that id is found even after a rename. Existing markers keep their ids.
- **[declared] Overlapping `replaceMany` runs no longer build a marker twice** (prompts-core-AC-1):
  in one tab, real runs queue per scene and the later one re-reads its markers, so one the earlier
  run replaced reports `MARKER_GONE` ("already replaced … now …"); across tabs, each marker is
  claimed with the kit's `claimDocument` (`flags.pentaryn-prompts.claims.replace`, about 0.75 s per
  run) before anything is built, and a marker another GM tab holds fails that row only. A failed
  row's claim is taken off its marker; `force` takes over a stale one. `lib/election.mjs` vendored.
- **[declared] One vanished marker no longer leaves the scene's other markers behind**
  (prompts-core-AC-2): skip-and-report, no rollback. The marker delete leaves out a marker already
  gone (its row keeps its replacement and WARNs `marker <id> was already gone before the delete`);
  if the delete still throws, each marker is deleted on its own and a refusal fails only that row
  (`markerDeleted=false`, WARN `marker <id> not deleted: …`).
- **[declared] A keyless keydown no longer throws in the type-ahead** (prompts-core-R4): an event
  whose `key` is not a string (synthetic or some IME/accessibility events) is swallowed while a
  note is capturing, exactly as a composing key is, and the typed text is left as it was.
- **[declared] The setting defaults are written once** (prompts-core-EXT-2): `core/defaults.mjs`
  `DEFAULTS` (`unseenWithinFt` 60, `cropMaxPerCall` 6, `cropLongSidePx` 768, `cropsDefault` auto,
  `gatherChars` = `GATHER_CHARS`) feeds the setting rows, gather's/the panel's/the crops' fallbacks
  and the core's default parameters. Same values, no behaviour change.
- **[declared] Deleting an actor refreshes the hover counts** (prompts-core-EXT-1): the cache's
  hooks and their scopes are one table, `core/cache.mjs` `INVALIDATION` (hook → `scene` | `self` |
  `world` | `setting`), and `INVALIDATING_HOOKS` is its keys. `deleteActor` joins it as a world-wide
  drop, as `updateActor` already was.
- **[declared] The placed document types are one list** (prompts-core-EXT-3): `replace.mjs`'s
  private `PLACED` table (type → scene collection: Token, Note, AmbientLight, Tile) gives both the
  per-scene create order and the order a gone marker's replacement is looked up in. Same order as
  before, no behaviour change.
- **[declared] `buildView` is split into private helpers** (prompts-core-M3): the encounter
  relations, the loners' notes and the door groups are `encounterRelations`, `aloneNotes` and
  `doorGroups` in `core/view.mjs`, called in the same order. The gather output is byte-identical.
- **[declared] `replaceMany`'s write steps are private helpers** (prompts-core-M4): after the
  marker claims, `buildDocuments`, `placeOnScenes`, `discardFailed` and `readBack` in `replace.mjs`
  run in the old order; a test pins the call order (per scene, one create per type in Token, Note,
  AmbientLight, Tile order, then one marker delete). No behaviour change.
- **[declared] A P key or `place` that cannot build its marker gives up cleanly** (prompts-core-EC-6):
  an unreadable default-size setting or refused token data now logs "placing a prompt marker
  failed", cancels the type-ahead ticket and returns null, as a failed create already did; before,
  it rejected and left the keyboard captured until the type-ahead timeout. The P key also cancels
  its ticket on any rejection.
- **[declared] A lone Scene document passed to `gather` is stored by id** (prompts-core-EC-1): the
  manifest's `opts.scenes` (kept in the `lastCalls` world setting) now holds `["<id>"]`, as a list
  of Scene documents already did; before, the whole document was written into the setting.
- **[declared] A call `party` that cannot be read is treated as not given** (prompts-core-EC-3):
  `gather` falls back to the world setting (`partySource: "setting"`), and with no readable world
  party the `<party>` line reads `none set` and says the call's party could not be read. `""` is
  simply not given. Before, an unreadable call party still overrode the world party and was reported
  as from "this call" while the text printed `none set`.
- **[declared] Paging `scenes: "all"` survives a `next` scene that lost its prompts** (prompts-core-EC-7):
  a `from` that is a scene but no longer has prompts continues with the first prompted scene after it
  in navigation order (an empty page when none is left); before, it refused `SCENE_UNKNOWN`. An
  explicit scene list still refuses a `from` it does not hold, and so does a `from` that is no scene.
- **[declared] `encounterXp`'s docblock says who counts** (prompts-core-M1): each built creature's
  XP comes from `actorXp(actor, token)`, which decides who counts; the wrong "Hostile-or-neutral npcs
  only" sentence is gone. Comment only, no behaviour change.
- **[declared] A placed document reads the same in the readback and in `MARKER_GONE`** (prompts-core-EXT-4):
  one private `nameOf(doc)` in `replace.mjs` (name, then text, then journal entry name, then "Light"
  for an AmbientLight; an empty one falls through) labels both. A note pin with an empty label now
  reads `Note "<entry>"` in the readback too; before, it read `Note ""` there.
- **[declared] One "segment or normalise it" helper** (prompts-core-M6): `rayPasses`, `doorLines`'
  wall list and `makeRel` call a core-only `asSegment` in `core/sight.mjs` (not on the
  geometry-core barrel) instead of three copies of the test. `doorLines`' own door test stays
  loose. No behaviour change.
- **[declared] One crop path** (prompts-core-M7): `gather` and `crops` share a private
  `cropImages` in `gather.mjs` — the same `cropMaxPerCall` / `cropLongSidePx` reads and the same
  upload under `pentaryn-prompts-crops/<call>/`. `gather` still crops its encounters in id order,
  `crops` the ones asked for in the order asked. No behaviour change.
- **[declared] `renderGather` is shorter** (prompts-core-M9): the `<overview>` block is a private
  `renderOverview` and the "which encounters hold this built thing" query is one private `homesOf`
  in `core/gather-text.mjs` (neither exported), used by the Shared-with line, the Built line and a
  shared built's `shared=`. The gather text is byte-identical. No behaviour change.
- **[declared] Five file headers say what their file holds** (prompts-core-M11): `core/text.mjs`,
  `core/placement.mjs`, `core/size.mjs`, `prompts-core.mjs` and `build-core.mjs`'s re-export comment
  now list their names and where each is re-exported or imported from (not every core name is on the
  geometry-core barrel). Comment only, no behaviour change.
- **[declared] Three restated tables are derived from their source** (prompts-core-M12): npc-core's
  `ABILITY_KEYS` is build-core's `ABILITIES`; `core/size.mjs`'s `DND_SIZE_WIDTH` is read off `SIZES`
  and `PC_SIZE_WORDS` is `SIZE_WORDS` filtered to tiny..large. Oracle tests pin the old values, so
  no behaviour change.
- **[declared] The legend's Bands line is read off `BANDS`** (prompts-core-M13): `core/gather-text.mjs`
  builds "Bands: touching 5 | … | distant 155+." from `core/grid.mjs`'s `BANDS` instead of a hand
  copy, so a band change cannot leave the legend stale. An oracle test pins the old line byte for
  byte, so the gather text is unchanged. No behaviour change.
- **[declared] Core no longer imports from `build-core.mjs`** (prompts-core-M14): `sameName` moved
  into `core/text.mjs`; `core/pool.mjs` imports it from there and `build-core.mjs` re-exports the
  same function, so its pinned surface is unchanged. Core reaches up only to `prompts-core.mjs`'s
  identity constants. Same name matching, no behaviour change.
- **[declared] The prompt-id test is written once** (prompts-core-EXT-5): `core/group.mjs`, which
  hands out the p# ids, exports `isPromptId`; `core/doors.mjs` and `replace.mjs`'s encounter lines
  use it instead of restating `/^p\d+$/`. Same matching, no behaviour change.
- **[declared] The sourceRules enum is written once** (prompts-core-EXT-8): npc-core's local `RULES`
  (`["2014", "2024"]`) is used by `NPC_SPEC`, the features' shared source fields and the
  spellcasting feature instead of three copies. Same values and default (2014), no behaviour change.
- `ensureMarkers` repairs every drifted actor in one batch update. A hot re-import after
  `uninstall()` re-wires and republishes at once.
- Console only (DP9): a core token API that throws warns once; swallowed failures log at debug
  behind `CONFIG.debug["pentaryn-prompts"]`. With debug on, gather also prints where its time went
  (model, embeds, render, store, crops) and the stored manifest's size, and every `replaceMany`
  prints one summary line (prompts-lookup-18); the always-on gather line is unchanged.
- **[declared] Console only (R5):** the last silent catches now print that debug line too — an
  `@Embed` that does not resolve, a hex `getOffset` that throws, and the character build's
  `fromUuid`, spell/item lookup, class spell list, `createWithContents` and `canEnchant`
  fallbacks. What each falls back to is unchanged.
- **[declared] (R5-note):** an `@Embed` whose lookup throws (a compendium not yet loaded) is no
  longer remembered as blank for the rest of the page — the next panel render tries it again. A
  document that really is empty is still cached.
- Internals: `prompts-core.mjs`; `geometry-core.mjs` split into `core/*.mjs` behind the barrel;
  settings, keybindings and the manifest ring in `settings.mjs`; adapters (markers, scene, sight,
  crops, packs, character, actor-patch, npc, tokens, typeahead); features through the kit's hook
  registry; a wiring-only entry; one wall-segment builder, one size-word table and CR parser, one
  pool matcher, one token-data helper, a per-kind planner registry, named grouping distances, i18n
  literals (the orphan toast localised).

## 0.4.5 — 2026-10-11

A cut token's own biography in the gather points at the token, not `get-character <base id>`.

## 0.4.4 — 2026-10-11 (play test)

A new character's spell slots start full (PT2-2); the gather prints one description per actor
(PT2-5).

## 0.4.3 — 2026-10-10

A built Monk's weapons get the Martial Arts enchantment (usability Area 10).

## 0.4.2 — 2026-10-10

`"current"` inside a `scenes` list; the door line above the panel's fold; the footer says ⇧Esc
removes a new marker (usability Area 9).

## 0.4.1 — 2026-10-10

The panel refreshes on wall, door, token and note changes; `MARKER_GONE` says why; honest
`remaining`; the over-5 dry-run guard counts every requested replacement; `character.folder`.

## 0.4.0 — 2026-10-10

Eval round 3 (plan §14): characters built on an unsaved actor in the dry run, starting equipment,
spec files, party budgets.
