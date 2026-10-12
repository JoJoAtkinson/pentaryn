---
title: Addon blueprint — adjustments batch (foundry/adjustments.yml rows, consolidated)
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, adjustments]
---

# Adjustments batch — every `foundry/adjustments.yml` row the guides add or move

> **Re-anchored to 4e64f47 on 2026-10-11** (attunement and movement rows; creatures and portals rows). **Re-anchored to 28ccc87 on 2026-10-11** (combat rows). **Re-anchored to 28ccc87 on 2026-10-11** (riders rows; aoe rows).

**Read this when:** you are about to append to or edit `foundry/adjustments.yml` for a module
migration, or a guide's Record step tells you to append a row. **Not this file:** the row rules →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §5.6 · each row's what / why /
native_when text → the source guide step.

`foundry/adjustments.yml` is a shared file: rows are appended **in one batch while the file is idle**
(no other workflow editing it). Two kinds of change:

- **New rows** — can wait for the batch.
- **`files` moves** — a marker moved to another file in a refactor step. The updater's check greps
  each marker in the listed files, so these land **in the same change set as the move**, not later.

Every row: `modules: [pentaryn-<m>]`, `check: make foundry-<m>-check` (walls: `make
foundry-walls-test`; pings until its target exists: `node foundry/module/pentaryn-pings/test/run.mjs`).
Before adding: grep each marker in its file; in a scratch copy misspell one and confirm `make
foundry-adjustments-check` fails.

**Row-id prefix and C32 (decision D2 pending).** C32 fails any `<short>-…` row that no
`wrapMethod({adjustments})` names. Until Joe decides D2 (and R1 lands), a row that is **not a patch**
uses the package prefix (`core-`, `dnd5e-`, `itempiles-`, `argon-`, `socketlib-`). The "C32" column
flags rows the guides named with the module prefix although they are not patches; take the
"interim id" or wait for D2.

## Batch A — non-WAIT modules (Stage 2)

| Module | Row id | Kind | Files | Markers | C32 | Source |
|---|---|---|---|---|---|---|
| importer | `dnd5e-importer-gate` (existing) | files move | `importer-core.mjs`, `documents-adapter.mjs` (+ keep `scripts/foundry/build_actors.py`) | `targetSystemVersion` | ok | importer step 4 (same change set as 4a) — **landed** with 4a on `migrate/wave-1` |
| pings | `pings-core-ping-handle` | new, **patch** | `capture.mjs` | `handlePing`, `__pentarynPatched` | ok (wrapMethod names it) | pings step 4 — **landed** (wave 1 integration, `check: make foundry-pings-check`) |
| pings | `core-pings-user-activity-socket` (was `pings-core-user-activity-socket`) | new, not a patch | `capture.mjs` | `userActivity` | ok (package prefix per D2) | pings step 4 — **landed** (wave 1 integration) |
| cursors | `core-board-cursor-vars` | new, not a patch | `board.mjs` | `currentCursor`, `_placementContext`, `setCursor` | ok | cursors step 10 — **landed** (wave 1 integration); aoe's file added when aoe leaves WAIT |
| movement | `movement-drag-constrain-ghost` | new, **patch** | `ghost.mjs` (`movement.mjs` if the batch lands before S4) | `_getDragConstrainOptions`, `__pentarynMovement` | ok | movement S2 — **landed** (wave 2 integration) |
| movement | `movement-keyboard-constrain-ghost` | new, **patch** | same | `_prepareKeyboardMovementUpdates` | ok | movement S2 — **landed** (wave 2 integration) |
| movement | `movement-layer-sort-owned` | new, **patch** | same | `sortChildren`, `_lastSortedIndex` | ok | movement S2 — **landed** (wave 2 integration) |
| attunement | `itempiles-attunement-repair` (existing) | files move | `actor-adapter.mjs` | `isValidItemPile` | ok | attunement step 3 — **landed** (wave 2 integration); the move was `5f3bf2d5`, so `adjustments-check` was red from there until this row |
| attunement | `dnd5e-armor-proficiencies` (existing) | files move | `attunement-core.mjs`, `actor-adapter.mjs` | `armorProficienciesMap` | ok | attunement step 3 — **landed** (wave 2 integration) (same red range) |
| attunement | `dnd5e-item-tooltip-anchor` (existing since U-8-5, 2026-10-11 re-anchor) | files move, **patch** (becomes a `wrapMethod` in step 3) | `actor-adapter.mjs` | `_positionItemTooltip` (keep the `pentarynGuarded` marker literal) | ok (wrapMethod names it) | attunement step 3 — **landed** (wave 2 integration), **renamed `attunement-item-tooltip-anchor`** (the id `actor-adapter.mjs`'s `wrapMethod` names, D2 module prefix for a patch); markers `_positionItemTooltip`, `pentarynGuarded` |
| journal | `journal-itempiles-preview-copy` | new, not a patch | `sources-adapter.mjs` | `pileData`, `canInspectItems` | **fails** — interim id `itempiles-journal-preview-copy` | journal step 7 — **landed** (wave 2 integration) as `itempiles-journal-preview-copy` |
| dropbin | `dropbin-socketlib-relay` | new, not a patch | `socketlib-adapter.mjs` | `registerModule`, `executeAsGM` | **fails** — interim `socketlib-dropbin-relay` | dropbin step 10 — **landed** (wave 2 integration) as `socketlib-dropbin-relay` |
| dropbin | `dropbin-itempiles-nan-attunement` | new, not a patch | (per guide) | `ATTUNEMENT_PACKS`, `repairAttunement` | **fails** — interim `itempiles-dropbin-nan-attunement` | dropbin step 10 — **landed** (wave 2 integration) as `itempiles-dropbin-nan-attunement` |
| dropbin | `dropbin-itempiles-container-locks` | new, not a patch | (per guide) | `item-piles-preRenderInterface`, `item-piles-preRenderActorSheet` | **fails** — interim `itempiles-dropbin-container-locks` | dropbin step 10 — **landed** (wave 2 integration) as `itempiles-dropbin-container-locks` |
| dropbin | `dropbin-itempiles-directory-hiding` | new, not a patch | (per guide) | `renderActorDirectory` | **fails** — interim `itempiles-dropbin-directory-hiding` | dropbin step 10 — **landed** (wave 2 integration) as `itempiles-dropbin-directory-hiding` |
| dropbin | `dropbin-itempiles-svelte-store` | new, not a patch | `piles.mjs` | `appShell` | **fails** — interim `itempiles-dropbin-svelte-store` | dropbin step 10 — **landed** (wave 2 integration) as `itempiles-dropbin-svelte-store` |
| dropbin | `itempiles-corpses`, `itempiles-rarity-i18n` (existing) | files move | per dropbin step 4 | unchanged | ok | dropbin step 4 — **landed** (wave 2 integration): `itempiles-corpses` gains `piles.mjs` (its marker `itempiles` lives there now); `itempiles-rarity-i18n` unchanged |
| prompts | `prompts-token-dblclick` | new, **patch** | `patches.mjs` | `__pentarynPromptsClick`, `_onClickLeft2` | ok | prompts step 6 — **landed** (wave 3 integration) |
| prompts | `prompts-item-piles-hotspot` | new, not a patch | `replace.mjs`, `scene-adapter.mjs` | `flags.item-piles.data`, `Hotspot · Look (template)` | **fails** — interim `itempiles-prompts-hotspot` | prompts step 6 — **landed** (wave 3 integration) as `itempiles-prompts-hotspot` |
| ties | `ties-item-piles-pile-check` | new, not a patch | `look-menu.mjs`, `preview-app.mjs` | `item-piles`, `data`, `isValidItemPile` | **fails** — interim `itempiles-ties-pile-check` | ties S14 — **landed** (wave 3 integration) as `itempiles-ties-pile-check` |
| ties | `core-ties-flag-wipe`, `dsn-skip-blind-study` (existing) | files move | `core/known.mjs` (+ the `ForcedDeletion` comment's file), `look-app.mjs`, `preview-app.mjs`; `study/apply.mjs` | unchanged | ok | ties S4b/S14 — **landed** (wave 3 integration); `core-ties-flag-wipe` → `core/known.mjs`, `look-app.mjs`, `preview-app.mjs`; `dsn-skip-blind-study` → `study/apply.mjs` (the moves landed earlier, so adjustments-check was red from `c9276cb8` until this batch) |
| ties | `dnd5e-legacy-roll-modes` (existing, **shared with aoe — WAIT**) | files move, **ties path only** | `study/apply.mjs` | unchanged | ok | ties S14, §6 caveat 1 — **landed** (wave 3 integration) (ties path only) |

## Batch B — WAIT modules (Stage 4; each after its `wait.json` entry is lifted)

| Module | Row id | Kind | Files | Markers | C32 | Source |
|---|---|---|---|---|---|---|
| creatures | `creatures-libwrapper` (existing) | rewrite, **patch** | `owner-sees.mjs` (+ creatures-core) | `isVisible`, `_testCulled`, `_previewType`, `__pentarynCreaturesVisible` | ok (needs kit K1 — landed) | creatures step 5 — **landed** (wave 3 integration): files `owner-sees.mjs` only (no marker in creatures-core), packages `[lib-wrapper, core]`, `retire_class: guarded` |
| creatures | `creatures-item-piles-flag` | new, not a patch | `creatures-core.mjs` | `item-piles` | **fails** — interim `itempiles-creatures-flag` | creatures step 5 — **landed** (wave 3 integration) as `itempiles-creatures-pile-flag` (the creatures Result's id) |
| creatures | `creatures-strip-over-argon` (existing since `17275c9`, adjustments.yml:873-882) | rename (not a patch) + files move | `strip.mjs`, `creatures-core.mjs` | `stripDock`, `.extended-combat-hud` (unchanged) | **fails live** — rename to `argon-creatures-strip-float` | creatures step 5 (re-anchor 2026-10-11) — **landed** (wave 3 integration) as `argon-creatures-strip-float` |
| portals | `core-teleport-dialog-cards` | new | `cards.mjs`, `portals-core.mjs` (the guide's integrator list; `select[name="destination"]` is only in `cards.mjs`) | `dialog-`, `select[name="destination"]` | ok | portals ADJ — **landed** (wave 3 integration) |
| portals | `core-teleport-replacements-follow` | new | `party.mjs` | `replacements` | ok | portals ADJ — **landed** (wave 3 integration) |
| portals | `core-region-config-portal-card` | new | `cards.mjs` | `region-appearance` | ok | portals ADJ — **landed** (wave 3 integration) |
| portals | `itempiles-portals-pile-pc` | new | `scene-adapter.mjs` | `isValidItemPile` | ok | portals ADJ — **landed** (wave 3 integration) |
| portals | `core-portals-relative-uuid` (existing) | files move | `portals-core.mjs`, `scene-adapter.mjs`, `cards.mjs` | unchanged | ok | portals S3 — **landed** (wave 3 integration) |
| portals | `portals-teleport-default-and-spread` (**renamed `core-teleport-default-and-spread`**, D2 `df661e0`) (existing since `17275c9`, adjustments.yml:884-893) | rename (not a patch) + markers + files move | `cards.mjs`, `party.mjs` (not `portals-core.mjs`: it holds none of the markers) | `data-action="yes"`, `:scope > p`, `spreadArrival` (was `preferTeleport`, `spreadArrival`) | **fails live** — rename to `core-teleport-default-and-spread` | portals ADJ (re-anchor 2026-10-11; -31 extension) — **landed** (wave 3 integration) |
| senses | `core-light-animation-shader` | new | `glow.mjs` | `TorchIlluminationShader`, `lightAnimations` | ok | senses step 12 — **landed** (wave 3 integration) |
| senses | `core-token-preview-private` | new | `chain.mjs` | `_preview` | ok | senses step 12 — **landed** (wave 3 integration) |
| senses | `core-primary-sort-layers` | new | `chain.mjs` | `SORT_LAYERS` | ok | senses step 12 — **landed** (wave 3 integration) |
| senses | `dnd5e-light-summon-suppress` | new | `light.mjs`, `light-ui.mjs` | `create.summons`, `placeSummons` | ok | senses step 12 — **landed** (wave 3 integration) |
| senses | `core-teleport-replacements` | new | `light.mjs` | `replacements` | ok | senses step 12 — **landed** (wave 3 integration) |
| senses | `senses-light-pick-collapse-hud` (**renamed `argon-light-pick-collapse-panels`**, D2 `df661e0`) (existing, live) | not a patch | `argon.mjs` | — | **fails** — option (b) rename `argon-light-pick-collapse-panels`, or D2 | senses step 12 — **landed** (wave 3 integration): files → `argon.mjs` |
| senses | `dnd5e-chat-message-types` (existing, shared aoe/riders/combat) | files move | `light.mjs` path follows its move (→ `light-ui.mjs`, the usage-card read) | unchanged | ok | senses step 12 — **landed** (wave 3 integration) |
| riders | `riders-argon-ritual-adept-list`, `argon-shared-uses-badge`, `argon-collapse-on-area-placement`, `dnd5e-chat-message-types` (existing) | files move | `rituals.mjs`/`patches.mjs`; `argon-tidy.mjs`/`argon.mjs`; `damage-riders.mjs`/`card-note.mjs` | unchanged | check `riders-argon-ritual-adept-list` is named by a `wrapMethod` | riders S8 |
| riders | `riders-dnd5e-damage-tray-preset` | new | per guide | `getTargetOptions`, `dnd5e.preCalculateDamage` | **fails** unless a patch — interim `dnd5e-riders-damage-tray-preset` | riders S8 |
| riders | `riders-dnd5e-roll-term-riders` | new | per guide | `postDamageRollConfiguration`, `resetFormula` | as above — interim `dnd5e-riders-roll-term-riders` | riders S8 |
| riders | `riders-dnd5e-sheet-hit-dice` | new | per guide | `meter.hit-dice`, `renderCharacterActorSheet` | as above — interim `dnd5e-riders-sheet-hit-dice` | riders S8 |
| riders | `riders-core-query-battle-medic` | new, not a patch | per guide | `CONFIG.queries` | **fails** — interim `core-riders-query-battle-medic` | riders S8 |
| riders | `dnd5e-summon-place-default`, `dnd5e-summon-wildcard-preview`, `argon-tooltip-item-rolldata`, `argon-metamagic-no-picker` (existing since `17275c9`, adjustments.yml:719-739, 796-805, 818-827) | files move, **patch** (S5 `wrapMethod`/`defineAccessor` names them, combat-riders-39) | `+ patches.mjs` (markers `_prPlaceDefault`, `_prWildcard`, `_prItemRollData` move there; `skipsTargetPicker`/`METAMAGIC` stay in argon-tidy/table-core) | unchanged | ok | riders S8 (re-anchor 2026-10-11) |
| riders | `riders-arcane-recovery-picker`, `riders-argon-long-casts` (existing since `17275c9`, adjustments.yml:829-849) | not patches | unchanged (cast-flow.mjs/table-core.mjs; rituals.mjs/rituals-core.mjs) | unchanged | **fails live** — interim `dnd5e-riders-arcane-recovery-picker`, `argon-riders-long-casts`, or name both from the Rituals `wrapMethod` (D2) | riders S8 (re-anchor 2026-10-11) |
| riders | `dnd5e-chat-message-types` (existing) | widen files | `+ foundry/module/pentaryn-riders/concentration.mjs` (save-message reads, combat-riders-16 ext.) | unchanged | ok | riders S8 (re-anchor 2026-10-11) |
| aoe | `aoe-argon-handle-bind` (existing) | files move, **patch** (S6 `wrapMethod` names it) | `argon.mjs`, `core.mjs` | `guardArgonBind`, `isHandleTarget`, `_aoeGuard` | ok | aoe ADJ |
| aoe | `aoe-core-region-delete-update-race` (**renamed `core-region-delete-handle-race`**, D2 `df661e0`) (existing) | not a patch | `areas.mjs`, `core.mjs` | unchanged | **fails** — rename `core-region-delete-handle-race` (aoe decision §6.1) or D2 | aoe ADJ |
| aoe | `core-region-placement-escape` (existing) | widen | `+ foundry/module/pentaryn-cursors/board.mjs` (the `_placementContext` read moved out of `cursors.mjs` in the cursors rebuild); `modules: [pentaryn-aoe, pentaryn-cursors]` | unchanged | ok | aoe ADJ (-39) |
| aoe | `itempiles-aoe-skip-piles` | new | `scene-adapter.mjs` | `isValidItemPile`, `item-piles` | ok | aoe ADJ |
| aoe | `dnd5e-chat-message-types`, `dnd5e-legacy-roll-modes`, `dnd5e-token-size-lock` (existing) | files move | `messages-adapter.mjs`, `scene-adapter.mjs`, `settings.mjs` | unchanged | ok | aoe ADJ |
| aoe | `aoe-self-area-aim` (existing since 17275c9) | **patch** (S6 `wrapMethod` names it, finding -44) | unchanged (`aim.mjs`, `core.mjs`) | `aimFromCaster`, `placeRegions`, + `aimWrapped` | ok once -44 lands; **fails** today | aoe ADJ, S6 |
| aoe | `aoe-careful-spell-protected-rows` (**renamed `dnd5e-careful-spell-protected-rows`**, D2 `df661e0`), `aoe-supersede-same-usage` (**renamed `dnd5e-supersede-same-usage`**, D2 `df661e0`), `aoe-player-status-line` (**renamed `core-private-roll-rows-hidden`**, D2 `df661e0`), `aoe-untargeted-touch-self` (**renamed `dnd5e-untargeted-touch-self`**, D2 `df661e0`), `aoe-same-spell-no-stack` (**renamed `dnd5e-same-spell-no-stack`**, D2 `df661e0`) (existing since 17275c9) | not patches | unchanged | unchanged | **fails** (four flagged by C32 today) — rename to the upstream prefix (aoe decision §6.1) or D2 | aoe ADJ |
| aoe | `dnd5e-cancelled-area-refund` (existing since 17275c9, shared with combat) | none | unchanged (`refund.mjs`, `core.mjs`, combat `combat.mjs`) | unchanged | ok | aoe ADJ |
| transform | `argon-panel-injection`, `argon-target-picker-cancel`, `argon-bonus-used-tracking`, `argon-portrait-hp`, `argon-tooltip-clear`, `core-transform-unwrap`, `core-token-swap-no-animation` (existing) | files move | `form-picker.mjs`, `argon.mjs`, `hud-panels.mjs`, `wildshape-adapter.mjs`, `patches.mjs`, `bodyswap.mjs` | unchanged | ok | transform (same change set as the move) |
| transform | `transform-reads-combat-multiattack` | new, not a patch (cross-module contract) | per guide | `multiattackCoveredByFullAttack`, `pentaryn-combat` | **fails** — interim `core-transform-reads-combat-multiattack`, or D2 | transform §4 (tc-13), combat S13 |
| combat | every combat row whose marker moved | files move | `hud/*.mjs`, `argon.mjs`, `turnflow/*.mjs`, `patches.mjs`, `turn-riders.mjs`, `combat-core.mjs`, `core/damage.mjs`, `roll-dock.mjs`, `shapes.mjs` | unchanged | 34 `combat-*` rows (25 at the snapshot; the re-run added 9) name no `wrapMethod` today (C32) — S6c/S13 | combat S13 (re-anchored to 28ccc87) |
| combat | `dnd5e-chat-message-types` (existing) | add `pentaryn-combat` | `turn-riders.mjs`, `turnflow/dialogs.mjs`; `check += make foundry-combat-check` | unchanged | ok | combat S13 |
| combat | `combat-core-flag-forced-replacement` | new, not a patch | `shapes.mjs` | `ForcedReplacement`, `==turn` | **fails** — interim `core-combat-flag-forced-replacement` | combat S13 |
| combat | `dnd5e-cancelled-area-refund` (existing, shared with aoe) | correct `what` | unchanged | unchanged | ok | combat S13 (combat-riders-36: combat does not read `refundCancelledArea`; the row says it does) |
| combat | `combat-reads-aoe-placement` (name per D2: the upstream-prefix rule may make it `core-combat-reads-aoe-placement`) | new, not a patch (cross-module contract) | `combat-core.mjs` (`areaPlacementSkipped`), `shapes.mjs` (`isAoeHandle`) | `areaPlacementSkipped`, `pentaryn-aoe` | **fails** as named, like `transform-reads-combat-multiattack` | combat S8/S13 (combat-riders-36, added at the 28ccc87 re-anchor) |

## Appended by Record steps

| Date | Module | Row id | Kind | Source |
|---|---|---|---|---|

## Batch checklist

1. `foundry/adjustments.yml` is idle (no other workflow has it open).
2. Every "files move" row of a module lands with that module's move commit, not here.
3. New rows: grep each marker in its file; scratch misspell test; `make foundry-adjustments-check`.
4. `conformance.py --module <m>` per module: C32 and C47 pass (except the rows flagged above while
   D2 is open).
5. Mark each source guide's Result row "Adjustments rows appended".
