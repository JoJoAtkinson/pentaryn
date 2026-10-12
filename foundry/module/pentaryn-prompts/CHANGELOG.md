# Changelog — Pentaryn Prompt Markers (`pentaryn-prompts`)

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
- **[declared] A patch's fractional CR** (`"1/2"`) is written as 0.5, not `NaN`, so a real run's
  encounter XP matches its dry run.
- **[declared] A bad `patch.disposition` word** (`"angry"`) is refused by the dry run too (R2):
  `BAD_SPEC: patch.disposition: hostile|neutral|friendly|secret`, checked after every other patch
  field so a second bad field keeps its own message. The real run now refuses it at plan time, so
  nothing is imported, copied or stamped first (no cleanup line, no `discarded` entry).
- **[declared] Two gathers at once keep both manifests**: the ring writes through one
  `serialStore` (a parallel gather no longer makes the other's call id `CALL_UNKNOWN`).
- **[declared] `ensureMarkers` no longer duplicates across two GM tabs** (§5.9.1): the folder and
  each marker actor are created with a fixed id (`pPromptsFolder00`, `pPrompts<size>` padded to
  16) and `keepId`, so when the bridge tab and a GM browser tab both find one missing, the second
  create replaces the first instead of adding a second `Prompt Markers` folder or `Prompt · <size>`
  actor. A folder holding that id is found even after a rename. Existing markers keep their ids.
- `ensureMarkers` repairs every drifted actor in one batch update. A hot re-import after
  `uninstall()` re-wires and republishes at once.
- Console only (DP9): a core token API that throws warns once; swallowed failures log at debug
  behind `CONFIG.debug["pentaryn-prompts"]`. With debug on, gather also prints where its time went
  (model, embeds, render, store, crops) and the stored manifest's size, and every `replaceMany`
  prints one summary line (prompts-lookup-18); the always-on gather line is unchanged.
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
