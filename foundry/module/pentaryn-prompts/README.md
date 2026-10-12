# Pentaryn Prompt Markers (`pentaryn-prompts`)

**Read this when:** you are changing or calling `pentaryn-prompts` — the marker box, the gather text,
replace, the `pentaryn-prompts.*` queries the fork's `prompt-markers` tool sends. **Not this file:** how
Claude uses it at a session → [`context/foundry/prompt-markers.md`](../../../context/foundry/prompt-markers.md) ·
the design → [`context/plans/prompt-markers.md`](../../../context/plans/prompt-markers.md) · how every
addon is built → `context/foundry/addon-blueprint.md` · the migration record →
`context/plans/addon-blueprint-2026-10/migrate-pentaryn-prompts.md`.

Drop a **prompt marker** on a map, type what should be there, press **Esc**. Later Claude reads every
prompt in one gather, with its surroundings worked out, and replaces each marker with the real thing.

## What the player sees

Players see nothing: markers are hidden tokens and everything below is GM-only.

On GM `ready` the module creates the **`Prompt Markers`** actor folder and six actors, and repairs
drifted fields on every later ready (never deletes): `Prompt · tiny` (0.5 × 0.5), `small` (1 × 1, art
at 0.8), `mid` (1 × 1), `large` (2 × 2), `xl` (3 × 3), `xxl` (4 × 4). The flag
`flags.pentaryn-prompts.marker = "<size>"` (actor and prototype) is the recognition key, never the
name. Every marker token is born hidden, sightless and size-locked. Art: `assets/marker-<size>.webp`
(`scripts/foundry/prompt_marker_art.py`).

- **Drag** a `Prompt ·` actor onto the map: its box opens beside it, caret in the text. **P** places
  a marker of this client's default size under the cursor (snapped); **Shift+P** opens the hovered one.
- **Esc** or **⌘/Ctrl+Enter** saves and closes · **Shift+Esc** puts the text back as it was when the
  box opened (a fresh marker then closes empty and is removed; the footer says so) · **Enter** is a
  newline. Typing autosaves after 600 ms.
- **Type straight away.** From the drop (or P, double-click, the HUD button) until the box has focus,
  keys are held for it (a capturing `keydown` on `window`, ahead of core's hotkeys) — they never reach
  the ruler or other hotkeys; ⌘/Ctrl shortcuts pass. Each pending open has its own buffer. Text no box
  claims within 3.5 s goes into the open box, else a toast. A window blur forgets held keys.
- Every open is a **new window**; closing saves in the background, so the next drop never waits.
  A fresh marker closed empty is deleted; one emptied by hand stays, red-tinted. A marker whose
  text failed to save is never deleted (it stays, with the save-failed toast).
- Reopen: **double-click** a marker, the **Token HUD** bubble button, Shift+P, or `open(id)`. A
  marker never has two boxes: reopening one already open (or still saving) brings that box forward.
- **Size chips** swap the marker for another size centred on the same point, text carried — keys
  typed while the swap runs included (no swap when the text failed to save). One swap at a time:
  the chips grey out while it runs, a second click (a double click) is ignored, and closing or
  Delete waits for it to finish.
- **Side panel:** what this marker can see (unlimited darkvision, doors as they stand, light
  ignored), nearest first; *Out of sight (within 60 ft)* with `door` / `wall` tags; anything blocked
  only by a door named above the list. Click pans, ⌘-click opens the sheet or box. It redraws when a
  wall, door, note, light, tile or token on the scene changes.
- **Hover** a marker: its text, size, footprint and how many things it sees.
- Nameplate: `✎ ` + the text, lines joined by ` / `, cut at 40 characters.

## Settings

| Key | Scope | Default | What |
|---|---|---|---|
| `panelRows` | world | 12 | Side-panel rows before "+N more" |
| `panelChars` | world | 90 | Characters of text per side-panel row |
| `gatherChars` | world | 400 | Characters of a built thing's description in the gather (cut at a sentence) |
| `unseenWithinFt` | world | 60 | Out-of-sight things this close are still listed (panel and gather) |
| `cropMaxPerCall` / `cropLongSidePx` | world | 6 / 768 | Encounter crops per call, and their long side |
| `cropsDefault` | world | `auto` | Crops when a gather does not say (`auto` = exactly one scene with art) |
| `party` | world | blank | `4x5` (size x level) for encounter budgets; a call's `party` wins |
| `deleteEmptyOnClose` | world | on | A fresh marker closed empty is deleted |
| `defaultSize` | client | `mid` | The size the P key places |
| `lastCalls` | world, hidden store | `[]` | The last five gather manifests (replace and crops read them) |

Every read is live (`settings.mjs` `setting()`), so a change applies without a reload.

## API — `game.pentaryn.prompts`

Kit-built and frozen, published at `ready` on `game.modules.get("pentaryn-prompts").api` and
`game.pentaryn.prompts` (fires `pentaryn-prompts.ready`, `pentaryn.ready`). `describe()` is the full
table (`api-manifest.mjs`); `selftest()` checks the six actors, the double-click patch, the gather
query and the version. The twelve calls published before the migration keep their signatures:

| Call | Returns |
|---|---|
| `gather({scenes, crops, chars, unseenWithinFt, builtWithoutProvenance, maxPrompts, from, party, cropsAs})` | `{call, text, counts, manifest, crops, next, ms, version, party, partySource, cropsNote}` |
| `list()` | `{scenes: [{id, name, nav, prompts, empty}]}` |
| `crops({call, encounters, cropsAs})` | `{crops: [{encounter, scene, path \| png, mime, mimeType, squares} \| {encounter, scene, error}]}` |
| `replaceMany({call, replacements, dryRun, force, skipDryRun, party})` or `({specFile, dryRun})` — the batch | `{dryRun, call, text, results, remaining, encounters}` |
| `replace(spec, opts)` — ONE replacement (run options from `opts` or the spec) | same |
| `show({call, id})` / `show({sceneId, markerId})` | `{ok, sceneId, x, y}` (views the scene, pans, pings) |
| `status()` | `{version, listed, npcBridge, party, specDir, doubleClick, markers}` |
| `open(tokenOrId)` · `place(size?)` · `ensureMarkers()` · `model(sceneId)` · `manifests()` | the box · the token · a summary · the scene model · the ring |
| `inspect(ref, {sceneId})` | `{token, marker: {size, text} \| null, provenance}` (exact ref, never a substring) |
| `markersOn(sceneId)` · `manifest(call)` | `[{id, size, text}]` · one stored manifest or null |

`scenes`: `"all"` (default: scenes holding prompts, nav order), `"current"`, or ids/names (a list may
hold `"current"`). `crops`: `"auto"` · `true`/`"on"` · `false`/`"off"`. `cropsAs`: `"files"` (the API
default: `Data/pentaryn-prompts-crops/<call>/E1.webp`, no base64 in an eval-js result) or `"base64"`
(what the queries get; the bridge turns them into MCP images). `party`: `"4x5"`, `{size, level}` or
`[levels]`; the text's `<party>` line names it and its source, or says none is set. Paging: at most
`maxPrompts` (60) after the first scene; pass `next` as `from` with the same `scenes`. `specFile`: a JSON
file under the Data dir (`pentaryn-prompts-specs/<name>.json`): replacements, or `{call, party, replacements}`.
`place` and a drop arm the keyboard capture on the **calling** client for up to 3.5 s.

**Queries** (registered from the manifest, GM-guarded on sender and receiver):
`pentaryn-prompts.list`, `.gather`, `.crops`, `.replace` (= `replaceMany`), `.show`; a query before
the API is published answers `NOT_READY`. **Errors are** `Error("<CODE>: detail")`: `TEXT_CHANGED`
(replace: the prompt was edited after the gather), `MARKER_GONE` (show, replace: the marker is gone;
replace says what replaced it or what it was resized to), `CALL_UNKNOWN` (crops, show, replace: no
stored manifest), `SCENE_UNKNOWN` (gather, show, replace, `model`), `BAD_SPEC` (any bad argument, per
row in replace), `NOT_GM` (every query), `CREATE_FAILED` (replace rows) and `DRY_RUN_REQUIRED`
(replace: more than 5 without a dry run of the same set). The fork adds `MODULE_MISSING` and
`TIMEOUT`; the new reads throw the kit's `NOT_FOUND` / `AMBIGUOUS` / `BAD_ARGS`.

### Replacement kinds

`{call, id: "p3" | sceneId + markerId, with, name?, hidden?, note?, ring?, img?, disposition?}`;
`ring`: `pc` | `foe` | `named` | `mook` | `none` (characters default to `pc`). `with.kind`:

- `actor` — `{actorId}` (place a world actor; `copy: true` duplicates it) or `{uuid}` (a compendium
  actor, imported into `Foundry MCP Creatures`), plus `patch` (`actor-patch-adapter.mjs`, keys
  `PATCH_KEYS`): name, size, img, biography, hp, ac, cr (fractions read as numbers), speed,
  disposition (hostile|neutral|friendly|secret), `removeItems`, `addItems` (by name / uuid / inline `{data}`), `traits`, `recharge`,
  `itemUpdates`, `set`, `creatureType`, `languages` (words → dnd5e keys). The dry run refuses a
  misshapen field with `BAD_SPEC` naming the shape wanted (`removeItems` a list of names/ids,
  `itemUpdates` `[{item, set}]`, `set` an object, `hp` a number or `{max, formula}`, `ac`/`cr`/`speed`
  numbers). A type change without
  `languages` clears the inherited ones; inline items whose text requires attunement are marked so.
- `npc` — `{npc, features, patch}`, built here through the bridge module's own handlers
  (`CONFIG.queries["foundry-mcp-bridge.createNpcActor"]`), every field checked as the
  dnd5e-create-npc / -add-feature tools do; `{actorId}` places an existing actor as an npc.
- `character` — a level-N PC from the owned books (`character-adapter.mjs`, pure half
  `build-core.mjs`): `{name, level, class, subclass, species, background, abilities, abilityMethod,
  choices, hp, size, spells, spellbook, items, allowOffList, startingEquipment, biography, img, folder}`.
  dnd5e's own advancements run headlessly with the caller's `choices` or a stated default
  (`DEFAULTED`); every problem is collected into one `BAD_SPEC`. The dry run builds it on an unsaved
  actor, so its `sheet:`, `DEFAULTED` and `WARN` lines are the real run's. Spell slots start full;
  a Monk's weapons get Martial Arts. A spell named twice in `spells` (or in `spellbook`) is added
  once, with the warning `<spell> listed twice — added once`.
- `hotspot` — `{name, description, items, size = 0.5, locked, icon, light}`: a clone of
  `Hotspot · Look (template)` (Item Piles); `light` is an AmbientLight config at its centre.
- `note` — `{name, html, folderId, label, ownership = "observer", iconSize = 64, icon, light}`.
- `light` — `{config, hidden}` · `tile` — `{src, width, height}` · `none` — `{reason}`.

Results are flat rows (strings, numbers, booleans, lists of strings), built by `readback-core.mjs`;
`text` is the readback the MCP tool prints. Placement: same footprint → the marker's own x/y; other
creature footprints centred and snapped; hotspots and tiles centred unsnapped; notes and lights on the
centre. Every created document, actor and journal carries the provenance. A failed replacement keeps
its marker, and what this module created for it is deleted again (`discarded`).

### The gather, briefly

Distance between nearest occupied squares under the world's diagonal rule (hex grids count hexes);
bands `touching 5 | reach 10 | close 15–30 | near 35–60 | far 65–150 | distant 155+`; 8-point bearing.
Sight: core's sight collision on the item's Level, then a door-only pass for blocked pairs, run only
when printed. Encounters link at ≤ `LINK_FT` (30) with sight, formations at ≤ `FORMATION_FT` (15);
built things join but never bridge, and a hostile built creature brings its pack. Ids: groups by size
then reading order (`E#`, `p#`, `t#`); the `call` id hashes scenes, markers, texts and each `p#`.
Door lines, loners' nearest neighbours and what blocks two encounters are printed too. Not
modelled: wall heights and Levels elevations (a `WARN` line says so).

## Data written

| Where | What |
|---|---|
| `flags.pentaryn-prompts.marker` | actor, prototype and token: the marker size |
| `flags.pentaryn-prompts.prompt` / `.updatedAt` / `.swappedFrom` | marker tokens: the text, when it was saved, the marker a size swap replaced |
| `flags.pentaryn-prompts.provenance` | every document, actor, journal and hotspot item a replace creates: `{prompt, size, footprint, sceneId, markerId, call, pid, at, kind, note}` |
| `flags.dnd5e.lockSize`, `flags.item-piles.data` | marker tokens (lockSize); replaced tokens and hotspots (lockSize, the pile data) |
| world setting `lastCalls` | the gather manifest ring (newest five), written by the GM running gather |
| `Data/pentaryn-prompts-crops/<call>/` | crop images (`cropsAs: "files"`); `Data/pentaryn-prompts-specs/` is read, never written |
| Folders | `Prompt Markers` (the six actors), `Foundry MCP Creatures`, `Foundry MCP Characters` |

## Flags other modules read

None. `pentaryn-portals` and `pentaryn-aoe` decide what a "Marker" is with their own predicates;
the table is in `context/foundry/markers.md`.

## Events

None emitted (`renderPromptDialog` is core's ApplicationV2 hook). The hooks it listens to are
`test/golden/hooks.json` (registered at import), plus the scene-model cache's invalidation hooks
(`core/cache.mjs` `INVALIDATING_HOOKS`), registered at `ready`.

## Patches and adjustments

| Row | Kind | File |
|---|---|---|
| `prompts-token-dblclick` | patch: `Token#_onClickLeft2` through libWrapper (`MIXED`), else wrapped directly; marker `__pentarynPromptsClick` | `patches.mjs` |
| `itempiles-prompts-hotspot` | not a patch: hotspots clone the Item Piles template and write `flags.item-piles.data` | `replace.mjs`, `scene-adapter.mjs` |

`dialog.mjs` overrides `_onRender`, `_onPosition` and `_updatePosition` on its own ApplicationV2
subclass (the box): no row, nothing of core's is changed.

## Two sessions / who writes

Everything is GM-only. `ensureMarkers` runs on the active GM, which is every tab of that user;
its creates use fixed ids with `keepId`, so two tabs make one folder and one actor per size. The
queries are GM-guarded; the fork reaches them through the bridge module, which calls the handler in
its own GM tab. A `User#query` to the GM would run in **every** tab of that user, and `replace` is
not idempotent across tabs — keep calling it through the bridge. The side panel, hover tip and keyboard capture are per client.

## Extending

- **A replacement kind:** a `plan<Kind>` function and a `PLANNERS` row in `replace.mjs`, the kind in
  `KINDS` (`prompts-core.mjs`, same order), the fork's schema, then `contract.test.mjs`.
- **A query:** a manifest row with `query: true` (and `queryName` when it differs from the path);
  `registerQueries` wires it. The fork's `QUERIES` table must name it.
- **A gather fact:** `scene-adapter.mjs` `sceneItems` → `core/view.mjs` `buildView` →
  `core/gather-text.mjs` `renderGather`, then `UPDATE_SNAPSHOTS=1 node test/legacy-run.mjs` and read
  the snapshot diff.
- **Pure code** goes in `core/` (a file per concern) and, when other files import it by the old name,
  re-exported from `geometry-core.mjs` (public names only).

## Pitfalls

- The `pentaryn-prompts.replace` **query** is `replaceMany` (the batch); the `replace` **method** takes ONE spec.
- No legacy row may have a first param named `ref` (the kit would resolve it).
- `test/fixtures.mjs` is imported live by `test/scenarios.mjs` (`/modules/pentaryn-prompts/test/…`): it stays put.
- `test/golden/glue-exports.json` pins each file's exports under its old name; a new helper goes in
  its own file or `core/`, not into a pinned file's exports.
- The scene-model cache is off until `ready` installs the cache feature; gather never uses it.
- Type-ahead's `keyup` listener is installed at import and never removed (no uninstall yet).
- Console: the `gather <call>: …` summary always prints. `CONFIG.debug["pentaryn-prompts"] = true`
  adds gather's phase split with the stored manifest's size, and one `replace <call>: …` line per
  `replaceMany` (dry runs too). Texts: `core/log-lines.mjs`.

## Files

| File | Role |
|---|---|
| `prompts.mjs` | entry: wiring, FEATURES, init / ready |
| `prompts-core.mjs`, `geometry-core.mjs` + `core/*.mjs`, `build-core.mjs`, `npc-core.mjs`, `readback-core.mjs`, `typeahead-core.mjs` | pure |
| `settings.mjs`, `api-manifest.mjs`, `api.mjs` | settings and keybinding rows, the API table, its implementation |
| `marker-guard`, `placement`, `hud-button`, `tooltip`, `panels`, `patches`, `typeahead`, `cache` `.mjs` | features |
| `markers-`, `scene-`, `sight-`, `crops-`, `packs-`, `character-`, `actor-patch-`, `npc-`, `tokens-`, `typeahead-adapter.mjs` | adapters |
| `dialog.mjs`, `tip-ui.mjs` | UI |
| `gather.mjs`, `replace.mjs` | the gather / crops / list / show and replace calls |
| `lib/` | the vendored kit (never edited here) |

## Tests

`node test/run.mjs`: every `test/*.test.mjs` (node:test) and the legacy core suite
`test/legacy-run.mjs` (snapshots in `test/snapshots/`; `UPDATE_SNAPSHOTS=1` rewrites them — read the
diff). Goldens live in `test/golden/`; `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs` rewrites one
file's. `FOUNDRY_MCP_FORK=<fork checkout>` turns on the fork checks in `contract.test.mjs`,
`bridge-ctx.test.mjs` and `recharge-parity.test.mjs`. `test/scenarios.mjs` builds
the scratch scenes `ZZ Prompt Test 1/2` in a live world (`build()`, `setDoor()`, `cleanup()`).

## Sync

`make foundry-prompts-check` (parse, imports, i18n, the suite, kit, conformance), then
`make foundry-prompts-sync`, then **reload**; a `module.json` change needs a Foundry **restart**.
After a sync: `game.pentaryn.prompts.selftest()`.
