---
title: "dnd5e 5.3.3 → 6.0.6 upgrade (2026-10)"
status: executed
last_modified: 2026-10-10
tags: [context, plans, foundry, updates, dnd5e, rollback]
---

# dnd5e 5.3.3 → 6.0.6 upgrade (2026-10)

**Read this when:** executing, reviewing or rolling back the October 2026 move of the
Foundry install from dnd5e 5.3.3 to 6.0.6.
**Not this file:** the impact analysis and per-module port list →
[`foundry-update-2026-10.md`](foundry-update-2026-10.md) ("dnd5e 6.x go/no-go",
"dnd5e 6 port (deferred)") · how the updater works →
[`../foundry/automated-updates.md`](../foundry/automated-updates.md).

**Decision (Joe, 2026-10-10):** go to dnd5e 6 now, even though the Argon
(`enhancedcombathud-dnd5e`) and Item Piles (`itempilesdnd5e`) adapters have not declared
dnd5e 6 support. Port all of our modules. **Roll back only if something in Argon is truly
broken** (not cosmetic). Cosmetic or pentaryn-module problems are fixed forward.

## Pre-upgrade state (captured 2026-10-10 04:19, Foundry stopped)

- Foundry core **14.369**; all four worlds (ardenford, ardenhaven, pentaryn, space-journey)
  on `systemVersion` **5.3.3**. Repo at `f458ba1`, branch `foundry/table-feedback-2026-10`.
- Deployed `Data/modules/pentaryn-*` code matches git HEAD (only README/DESIGN `.md` files
  differ), so "redeploy from HEAD" reproduces what was running.
- Updater paused: `.state/vtt-update.pause` present (do not remove during this work).
- Enabled modules in **pentaryn** (41 of 42 configured; `pentaryn-walls 0.2.0` is
  installed but disabled). Machine-readable copy:
  `.state/core-rollback/enabled-modules-pentaryn-pre-dnd5e6.json` (also in the OneDrive
  folder below).

| Module | Version | Module | Version |
|---|---|---|---|
| betterroofs | 4.0.2 | pentaryn-aoe | 0.2.2 |
| dice-so-nice | 6.4.4 | pentaryn-attunement | 0.1.0 |
| dnd-dungeon-masters-guide | 2.0.0 | pentaryn-creatures | 0.1.0 |
| dnd-monster-manual | 1.4.0 | pentaryn-cursors | 0.1.0 |
| dnd-players-handbook | 2.2.0 | pentaryn-dropbin | 0.2.0 |
| eledryll-maps-castle-life-bundle-1 | 1.14.3 | pentaryn-importer | 1.0.0 |
| eledryll-spiders-tear-opera-house | 1.1.0 | pentaryn-journal | 0.1.0 |
| enhancedcombathud | 5.0.1 | pentaryn-lookup | 0.1.0 |
| enhancedcombathud-dnd5e | 5.2.2 | pentaryn-movement | 0.1.0 |
| foundry-mcp-bridge | 0.8.3 | pentaryn-names | 0.1.0 |
| gm-vision | 2.0.5 | pentaryn-pings | 0.1.0 |
| item-piles | 3.3.4 | pentaryn-portals | 0.4.1 |
| itempilesdnd5e | 1.1.0 | pentaryn-riders | 0.1.0 |
| levels | 7.0.3 | pentaryn-seafoot-maps | 1.0.0 |
| lib-wrapper | 1.13.5.1 | pentaryn-senses | 0.3.0 |
| mad-endlesswiz | 14.1.0 | pentaryn-ties | 0.19.1 |
| mad-endlesswiz2 | 14.1.0 | pentaryn-transform | 0.3.1 |
| monks-active-tiles | 14.01 | scene-packer | 2.8.12 |
| multi-token-edit | 3.3.7 | socketlib | v1.1.4 |
| theripper-premium-hub | 6.0.1 | tile-scroll | 5.0.0 |
| wall-height | 7.0.8 | | |

## Backups

All archives were verified with `tar -tzf` (and the world archive with `gzip -t`);
SHA-256 sums are in `SHA256SUMS-pre-dnd5e6` beside them.

| What | Primary | Size |
|---|---|---|
| World snapshot (`Data/worlds` all four, `Config`, `Data/modules`) | `~/Library/CloudStorage/OneDrive-Personal/DnD/foundry/pre-dnd5e6-2026-10/world-2026-10-10-041914-fvtt14.369.tar.gz` (sha256 `2ae3f04f…6065`) | 3233.1 MB |
| dnd5e 5.3.3 system folder | `.state/core-rollback/system-dnd5e-5.3.3.tar.gz` | 107.1 MB |
| enhancedcombathud-dnd5e 5.2.2 | `.state/core-rollback/module-enhancedcombathud-dnd5e-5.2.2.tar.gz` | 62.9 KB |
| itempilesdnd5e 1.1.0 | `.state/core-rollback/module-itempilesdnd5e-1.1.0.tar.gz` | 4.8 KB |
| enhancedcombathud 5.0.1 (extra) | `.state/core-rollback/module-enhancedcombathud-5.0.1.tar.gz` | 204 KB |
| item-piles 3.3.4 (extra) | `.state/core-rollback/module-item-piles-3.3.4.tar.gz` | 1.4 MB |

- The `.state/core-rollback/` system and module tarballs are also copied into the OneDrive
  `pre-dnd5e6-2026-10/` folder. A second dnd5e 5.3.3 copy is the automatic mirror
  `OneDrive/DnD/foundry/system-backup/dnd5e-5.3.3.tar.gz`.
- The same world tar is also in the rolling store `world-backups/`, **but it will be
  coalesced away** by the next `vtt-down`/`vtt-up` within 5 days. The `pre-dnd5e6-2026-10/`
  copy is the one that counts; the rollback below reads from it directly.
- The previous restore point (core 14.367, before this morning's core update) stays in
  `OneDrive/DnD/foundry/pre-update-2026-10/`.

## Port design (Fable, 2026-10-10)

Every claim below was checked against the 6.0.6 source tree in the session scratchpad
(`scratchpad/git606/dnd5e`, recovered from the release zip) and against our modules at
`f458ba1`. Line numbers are ours at HEAD. The three research inputs (dnd5e 6 diff, Argon audit,
Item Piles audit) are summarised where a decision depends on them; the raw notes stay in the
session, not the repo.

### Principles

1. **dnd5e 6 only.** No dual-version branches. The one exception is *data* that 5.3.3 wrote and
   the 6.0 migration does not rewrite: regions placed under 5.3.3 still carry
   `flags.core.MeasuredTemplate` and `flags.dnd5e.origin = <activity uuid>`, so the area matchers
   accept both markers. That is a few `??`s, not a branch.
2. **Native wins when it covers the case.** Three things move to dnd5e: darkvision → token
   vision, emanations following the caster, and players applying their own effects from the tray.
   Each was checked for the case it does *not* cover before ours was retired (details under
   "Retired"). Escape cancelling placement was planned as a fourth but kept on review: native
   Escape closes the open windows first (see "Review of the port").
3. **Keep what dnd5e 6 still does not do:** area ownership and handle tokens, finding everyone
   inside the placed area, GM-side NPC saves with a confirm tray, auto-damage on hit, self-apply
   and the unapplied highlight, concentration cleanup of areas, once-per-casting riders.
4. **One shim for third parties, and it is cosmetic:** the five `DND5E.ItemRarity*` /
   `DND5E.Unknown` i18n keys Item Piles still reads. Argon needs nothing (its one deprecated
   read, `abilities.*.checkBonus`, is shimmed by dnd5e until 6.2).
5. **The migration cannot be undone, so the world is launched on 6 exactly once, after the
   ported modules are deployed.** Our old module code must not run against 6.0 data.

### Stage order and model tiers

| # | Stage | Who | Gate |
|---|---|---|---|
| 0 | Backup (done 04:19) | — | archives verified |
| 1 | **Pre-flight on 5.3.3, live now** (below) | Sonnet, low | audit JSON written, lockSize set, tabs closed |
| 2 | Port: aoe · senses · riders · transform · ties · importer+scripts · dropbin shim · adjustments.yml | Opus, high; one unit per worker, aoe split in two (areas+core / resolve+effects+attacks) | `make foundry-<m>-check` green for every unit, `pytest scripts/tests` green, `make foundry-adjustments-check` green |
| 3 | Bridge fork | Opus, medium | fork tests/build green, module rebuilt into `Data/modules/foundry-mcp-bridge` |
| 4 | Install 6.0.6, sync every ported module, launch **pentaryn** from the GM bridge tab, wait for the migration, then the other three worlds | Opus, medium | `game.system.version` 6.0.6, `systemMigrationVersion` 6.0.6 in all four, no migration error in the GM console |
| 5 | Post-upgrade one-shots (below), then the three playtest suites | Opus builds the fixes, Sonnet runs the scripts and reports; Argon suite reviewed at xhigh because it is the rollback trigger | every row ticked or filed as fix-forward |
| 6 | Cleanup, Drow Prison active and paused, docs (`README.md` per module, `context/foundry/`), this file to `status: done` | Sonnet, low | `git status` shows only intended files; no commit |

### Pre-flight on 5.3.3 (the server is up on 5.3.3 right now, use it)

The new world setting `dnd5e.tokenSizeSync` (default on) is **not** read-only prepared data:
`documents/token.mjs:561-564` `_onOverrideSize` has the active GM **write** the synced width and
height to every persisted creature token whose size differs, on first render. The handle
tokens (0.5, "med" actor), the Marker actors (0.25), the Hotspot containers (0.5 and the 0.65
"Confiscated Belongings" eye) and any other deliberately odd token would be rewritten the moment
the GM bridge tab draws Drow Prison on 6. dnd5e 5.3.3 ignores `flags.dnd5e.lockSize`, and 6.0.6
honours it from the first load (`actor.mjs:422-433`), so set it **now**, while the world is still
on 5.3.3:

1. `eval-js`: for every world actor and every token on every scene, compare `width`/`height`
   with `CONFIG.DND5E.actorSizes[traits.size].token` (missing size → 1). Write the list of
   mismatches (uuid, name, width, height, size) to
   `.state/core-rollback/token-sizes-pre-dnd5e6.json`. This is the restore list if anything is
   resized anyway.
2. Set `flags.dnd5e.lockSize: true` on each mismatched prototype and placed token. Expected
   members: the nine `Marker · N` prototypes and their placed tokens, `Hotspot · Look (template)`
   and every placed Hotspot, every handle token, and any crowd or NPC token someone resized by
   hand. Do **not** lock PCs or ordinary NPCs: native sync is the behaviour we want there.
3. Update the handle actor: `system.traits.size: "tiny"` (0.5 matches the prototype, so sync is a
   no-op even without the flag) and `system.attributes.movement.hover: true` (falling automation
   exempts hovering creatures, `token.mjs:393`, so an elevated handle on a Levels scene is never
   marked Falling). Set `prototypeToken.flags.dnd5e.lockSize: true` as belt and braces.
4. Do not reset token sight yet: on 5.3.3 our senses module would write darkvision straight back.
5. Record `game.settings.get("core","rollMode")` and the `pentaryn-aoe.npcSaveRollMode` value for
   the setting migration in stage 5.
6. Close every tab the stage opened; leave the GM bridge tab.

### World settings on 6.0.6 (decided)

| Setting | Value | Why |
|---|---|---|
| `dnd5e.tokenSizeSync` | **on** (default) | native; the odd-sized tokens are locked in pre-flight. Lets the importer stop carrying `SIZE_TO_TOKEN` later. |
| `dnd5e.senseVisionSync` | **on** (default) | replaces our darkvision sync and also covers blindsight, tremorsense, truesight |
| `dnd5e.allowPlayerEffectsTray` | **on** | a player can put Mage Armor on themselves from the card; Part D's auto-self-apply stays for the one-target case |
| `dnd5e.allowPlayerDamageTray` | off (default) | the GM-confirm Apply in aoe Part B is the table's rule |
| `dnd5e.movementAutomation` | `full` (default) | test falling on a Levels scene; the handle actor hovers, flyers have `speeds.fly` |
| `dnd5e.autoApplyDowned` | none (default) | dropbin owns the 0-HP flow |
| `dnd5e.chatCardSummary` | per client, leave default | our Study rolls are not card rolls, so they are never folded |
| `pentaryn-aoe.npcSaveRollMode` | migrate `gmroll`→`gm`, `blindroll`→`blind`, `publicroll`→`public` | see A1 below |

### Three breaks the deferred list missed (all fixed in stage 2)

- **A1 Roll modes.** `basic-roll.mjs:254-271` hands the mode to core as `messageMode`; core
  silently replaces an unknown name with the client default, usually public. `ties/study.mjs:903`
  (`CONST.DICE_ROLL_MODES.BLIND` = `"blindroll"`) and `aoe/resolve.mjs:178` (setting value
  `"gmroll"`) both leak to players. Fix: `foundry.dice.Roll._mapLegacyRollMode(...)` at both
  call sites (it exists in core 14.369, `dice/roll.mjs:1156`) and new setting choices.
- **A2 Token sizes.** Pre-flight above.
- **A3 Riders' notes.** `roll-message-data.mjs:106` removes `.message-header .flavor-text` from
  every roll card with an item header, so the ` · Elemental Adept` suffix at `riders.mjs:208`
  vanishes. Fix: render the note from `flags.pentaryn-riders.applied` in
  `dnd5e.renderChatMessage`.

### Corrections to the deferred list (do not do these as written)

| Deferred-list item | Reality in 6.0.6 | Do instead |
|---|---|---|
| riders `:218-232` PRESET into a WeakMap | the tray passes `{ ...persistent }` (`damage-application.mjs:173, 606`) on every calculation and on Apply; a "once" marker means Apply gets no ignore set, Elemental Adept stops working | seed the tray's **persistent** per-target object: `tray.getTargetOptions(tokenUuid)` from the `damage-application` under `[data-message-id]`, mark it there |
| senses `light.mjs:528` → `[data-forward-action]` | only groupable buttons get it; `placeSummons` is not groupable so keeps `data-action` | selector stays; also remove the parent `<li>` |
| transform `:543` → `transformActorV2` | both hooks fire, neither deprecated (`actor.mjs:3165-3166`) | no change (our hook is at `transform.mjs:546`) |
| transform guard on `mode !== "form"` | 6.0.6 Wild Shape is still an actor transform (`wild-shape.yml:180-183`), default mode still `cr` | optional defensive guard only; test that Talo's activity is `cr` |
| importer: move the contract to `ac.override` / `init.roll.bonus` / `movement.speeds.*` | v14 migrates create *and* update payloads; dnd5e converts the old shapes (shims until 7.0) | **bump only the version gate**; the new shape changes every contentHash and forces a wholesale re-import |

### Per-module changes

Line numbers are ours at `f458ba1`. "Native" marks code retired in favour of dnd5e 6.

**pentaryn-aoe** (`foundry/module/pentaryn-aoe`, 0.2.2 → 0.3.0)

- `resolve.mjs:111, 362-363, 375`: `message.type === "damage"` / `=== "save"` instead of
  `flags.dnd5e.roll.type`; saves additionally `message.system.type === "ability"` (6.0 save
  messages also carry concentration and death saves).
- `resolve.mjs:112, 366`: activity from `message.getAssociatedActivity()` (fallback
  `message.system.activity?.uuid`).
- `resolve.mjs:77-87, 123`: targets are `message.system.targets[]` with `{actor, token}` uuids;
  use `token` directly, `actor` only for messages migrated from 5.3.3.
- `resolve.mjs:127`: `message.system.onSave ?? activity.damage?.onSave`. `:247`:
  `message.system.ability`.
- `resolve.mjs:178`: `rollMode: foundry.dice.Roll._mapLegacyRollMode(setting("npcSaveRollMode"))`
  (A1). `settings.mjs:17, 44-48`: choices `gm` / `blind` / `public`, default `gm`; a ready-time
  one-shot maps a stored legacy value and re-saves it; `lang/en.json` keys renamed to match.
- `resolve.mjs:173-184` and `:271-282`: pass
  `data: { system: { ...activity.messageSources, origin: <usage message id> } }` (or the
  equivalent `message` option dnd5e 6 reads) so our NPC and player saves land in the usage card's
  `outcomes` and the native damage tray's save multiplier agrees with our Apply. Verify in the
  cards suite that a creature we marked "saved" shows the half-damage pill natively.
- `resolve.mjs` request path (`requestResult` flags, `CONFIG.DND5E.requests`): unchanged
  (`request-message-data.mjs` is the same).
- `areas.mjs:25`: `isTemplateRegion = r => !!(r?.flags?.dnd5e?.activity || r?.flags?.core?.MeasuredTemplate)`.
- `areas.mjs:240-243` `preCreateRegion`: test `data.flags?.dnd5e?.activity` too.
- `areas.mjs:98, 109`: `flags.dnd5e.origin` is the caster **token** uuid now; name the handle from
  `fromUuidSync(flags.dnd5e.item)?.name`, then the activity's item, then `region.name`.
- `areas.mjs:130` `areasFor`: match `flags.dnd5e.activity === activityUuid`, keeping
  `origin === activityUuid` for 5.3.3-era regions. Without this Part B never finds the area.
- `areas.mjs:89, 175, 249`: skip any region whose `attachment?.token` is set and is **not** one
  of our handles (`isHandle`). Emanations are attached to the caster natively; a handle would
  detach them.
- `areas.mjs:203-231` `decorateCard`: gate on `message.type === "usage"`; activity from
  `message.system.activity`, item from `message.system.item`; look for
  `[data-action="placeTemplate"]`; `.card-buttons` is gone — insert an icon button in a `<li>`
  into `section.icon-row ul.unlist` (create the section when the card has no buttons, matching
  `card-buttons.hbs`), with `data-tooltip` and `aria-label` = "Remove all templates", class
  `icon`.
- `areas.mjs:283-287` concentration cleanup: unchanged in logic (concentration effect `origin`
  is still the item, areas are not concentration dependents). Read the item uuid as
  `effect.system?.origin?.item ?? effect.origin ?? effect.flags?.dnd5e?.item?.uuid` because
  migrated effects have `origin = null`.
- `core.mjs:175-180` `regionFromSpell`: add `flags5e.activity === activityUuid` and the
  `activity.startsWith(`${itemUuid}.Activity.`)` form, keeping both `origin` forms. Extend
  `test/run.mjs:119-129` with the 6.0 shapes (`{ activity, item, origin: "Scene.x.Token.y" }`).
- `attacks.mjs:24-31`: `m.type === "attack" && m.system.activity?.uuid === subject.uuid`;
  `attackMode` from `m.system.mode`, ammo from `m.system.ammunition`; thread with
  `{ "data.system.origin": m._source.system.origin }`.
- `effects.mjs:45-53`: `cardEffects` → `await message.system.getEffects()` (effects may be
  `.ActiveEffect.<id>` on the item **or** a `dnd5e.effects` compendium uuid). `cardEffects`,
  `pendingFor`, `selfReason` and `selfApply` become async; `decorate` awaits them.
- `effects.mjs:78, 130-132`: targets from `message.system.targets[].actor` / `.token`.
- `effects.mjs:83, 104`: an applied effect is matched by `_stats.duplicateSource === effect.uuid`
  (or `_stats.compendiumSource` for pack effects), not by `origin`.
- `effects.mjs:95-111` `applyEffect`: build the data with the tray's own
  `_prepareEffectData(effect, actor)` on an `effect-application` element whose `chatMessage` is
  set (`effect-application.mjs:232`); it applies AE replacement values and the auto-duration.
  `spellLevel` → `message.system.level`.
- `effects.mjs:230-239`: clicking an effect row now only selects it. Listen (capture) on
  `.apply-button`; the applied ids are the pressed `.effect[data-uuid]` rows and the targets are
  the `recorded-targets` selection. As written, a selection would be marked applied.
- **Native:** `escape.mjs` retired (whole file), `registerEscape`/`disableEscape`/`activePlacement`
  removed from `aoe.mjs:26, 34, 41, 73, 85`; core's `placeRegions` cancels on Escape
  (`regions.mjs:1011-1016`). Delete the `argon`-unrelated `placingTemplate` helper from
  `core.mjs` if nothing else uses it.
- `tray.mjs:83`: `.message-content` still exists; verify the tray renders **below** the native
  `<damage-application>` and does not collide with `section.icon-row`.
- `module.json`: version 0.3.0, `relationships.systems[dnd5e].compatibility`
  `{ minimum: "6.0", verified: "6.0.6" }`, description drops the Escape sentence.
- `README.md`: Part E removed; Part B notes the native save outcomes.

**pentaryn-senses** (`foundry/module/pentaryn-senses`, 0.3.0 → 0.4.0)

- **Native:** darkvision → token vision. Retire `senses.mjs:21-50` (`desiredSight`, `sync`) and
  the `sync`/`desiredSight` entries of the API at `:141-151`; `schedule` keeps calling
  `syncLight` only. `syncAll` keeps the light part. Keep `glow.mjs`, `chain.mjs`, `light.mjs`,
  `light-core.mjs` whole. Native `senseVisionSync` covers darkvision, blindsight, tremorsense and
  truesight, but only in prepared data and never clears a stored sense, so:
- New `migrate.mjs`: a world-scoped setting `pentaryn-senses.sightReset` (Number, default 0).
  On `ready`, the active GM, once per world when it is `< 1`: every token and prototype with
  `sight.enabled && sight.visionMode === "darkvision"` gets `sight.visionMode: "basic",
  sight.range: 0`; then the setting is set to 1. Native sync then derives the range from the
  sheet, and a removed sense (goggles confiscated) really goes dark. Runs in all four worlds
  without a hand step.
- `light.mjs:523-524` `decorateCard`: gate on `message.type === "usage"` and
  `message.system.item?.uuid`.
- `light.mjs:528`: keep the `[data-action="placeSummons"]` selector; remove `closest("li")` as
  well as the button.
- `light.mjs:530-536`: insert "On me" / "Pick a target" / "End" as icon `<li>` entries in
  `section.icon-row ul.unlist` (create the section when absent), `data-tooltip` + `aria-label`
  carry the labels. Drop the `.card-buttons` fallback.
- `module.json`: version 0.4.0, description rewritten (vision sync is dnd5e's now; the module is
  lights, glow, chain and the Light cantrip), add `relationships.systems` dnd5e
  `{ minimum: "6.0", verified: "6.0.6" }`.
- `README.md`: darkvision section becomes "handled by dnd5e `senseVisionSync`; the one-shot reset".

**pentaryn-riders** (`foundry/module/pentaryn-riders`, 0.1.0 → 0.2.0)

- `riders.mjs:119-125` `originOf`: `getProperty(message.data, "system.origin")` and
  `message.data["system.origin"]`, then the event-target fallback.
- `riders.mjs:131` `usedFrom`: compare `m._source.system?.origin === origin` (the live
  `system.origin` is a resolved document). Migrated 5.3.3 messages have their origin moved by the
  migration, so this also fixes the "stack once-per-casting riders" bug the hold predicted.
- `riders.mjs:208` (A3): stop appending to `flavor`; the note is rendered in a new
  `dnd5e.renderChatMessage` handler that reads `flags.pentaryn-riders.applied` and inserts a
  `<p class="pentaryn-riders-note">` after `section.icon-row` on damage cards. Keep writing the
  flag at `:195-198` (it is the once-per-casting guard).
- `riders.mjs:218-232` (section B): in `dnd5e.preCalculateDamage`, find the tray
  (`document.querySelector(`[data-message-id="${options.originatingMessage.id}"] damage-application`)`),
  take `tray.getTargetOptions(uuid)` for each `option` in `tray.targetList` whose token's actor
  is `actor`, and seed `ignore.resistance` + the PRESET marker **on that persistent object**.
  Fall back to today's behaviour (mutate the copy) when the tray is not in the DOM (chat popout,
  non-GM). Result: the preset survives Apply and the GM can untick it.
- `test/run.mjs`: fixtures for `usedFrom` with `_source.system.origin`.
- `module.json`: 0.2.0, dnd5e `{ minimum: "6.0", verified: "6.0.6" }`.

**pentaryn-transform** (`foundry/module/pentaryn-transform`, 0.3.1 → 0.3.2)

- `starry.mjs:123`: match `system.attributes.movement.fly` **or**
  `system.attributes.movement.speeds.fly` (effects written fresh under 6.0 use the new key; the
  PHB item's stored effects keep the old one and dnd5e redirects it on apply).
- `transform.mjs:284`: `delete e.origin; delete e.system?.origin;` for carried conditions.
- `transform.mjs:260-273` `attributeSync`: writing `system.attributes.exhaustion` still converts
  to the `dnd5eexhaustion` effect (`actor.mjs:3604-3614`); add a live test (form gains exhaustion
  1, revert, druid shows exhaustion 1) and a node fixture.
- `transform.mjs:546` hook: unchanged. Optional one-line guard
  `if (activity.transform?.mode === "form") return` in `doShift` (`:443`) with a notification,
  so a future "form"-mode Wild Shape item fails loudly rather than half-shifting.
- `hud.mjs`: no change. Argon's own `isPolymorphed`, movement shim and `senses.ranges` reads are
  fine on 6.0.6.
- `test/run.mjs`: fixtures to 6.0 shapes (`movement.speeds`, `system.origin` on effects).
- `module.json`: 0.3.2, dnd5e `{ minimum: "6.0", verified: "6.0.6" }`.

**pentaryn-ties** (`foundry/module/pentaryn-ties`, 0.19.1 → 0.19.2)

- `study.mjs:903`: `rollMode: foundry.dice.Roll._mapLegacyRollMode(CONST.DICE_ROLL_MODES.BLIND)`
  (A1). Update the comment at `:997`. Nothing else: sheet selectors, `details.race`/`background`,
  `rollSkill` signature are unchanged in 6.0.6.
- The `dsn-skip-blind-study` adjustment row still holds.

**pentaryn-importer + scripts/foundry** (`foundry/module/pentaryn-importer`, 1.0.0 → 1.1.0;
`scripts/foundry/build_actors.py`)

- `pentaryn-importer/module.json`: `flags.pentaryn.targetSystemVersion` `"5.3"` → `"6.0"`,
  `relationships.systems[dnd5e].compatibility` `{ minimum: "6.0.0", verified: "6.0.6" }`,
  version 1.1.0. `pentaryn-importer.mjs:362-401` needs no code change (it compares against
  `module.json` and the live minor); update the header comment that names 5.3.
- `build_actors.py:61` `TARGET_SYSTEM_VERSION = "6.0"`; `:65-90` enums unchanged except
  `AREA_TARGET_TYPES` gains `"ring"`; `GENERATOR_VERSION` 1.0.1. `CONTRACT` id stays
  `pentaryn/actors.json@1` — the output shape is unchanged on purpose (see corrections).
- **Deferred, written down so it is not lost:** `pentaryn-importer.mjs:116-127` `FORMULA_GLOBS`
  and `build_actors.py:121-122, 1153-1161, 1259` keep the legacy `movement.walk`, `init.bonus`,
  `ac.calc:"flat"` shapes. They are migrated on create and update until dnd5e 7.0. Move them
  with the next contract bump (`@2`), together with dropping `SIZE_TO_TOKEN` now that
  `tokenSizeSync` sizes tokens natively.
- `foundry/CONTRACT.md` §1: note the 6.0 target and the shim-until-7.0 shapes.
- Proof: `make foundry-actors` regenerates `actors.json`; a dry `make foundry-import` must report
  every actor unchanged (same contentHash), and the gate must pass on 6.0.6.
- `scripts/tests/test_module_checks.py` and any test pinning `"5.3"`: update.

**pentaryn-dropbin** (`foundry/module/pentaryn-dropbin`, 0.2.0 → 0.2.1) — the Item Piles shim

- New `i18n-shim.mjs`, imported from `dropbin.mjs`: at `i18nInit`, add
  `DND5E.ItemRarityCommon/Uncommon/Rare/VeryRare/Legendary/Artifact` (copied from
  `DND5E.ITEM.Rarity.*`) and `DND5E.Unknown` to `game.i18n.translations.DND5E` **only when
  missing**. Item Piles' merchant Rarity column and the unidentified placeholder read these keys
  (`itempilesdnd5e` 5.0.0 config block). Lives in dropbin because it is the module that already
  owns our Item Piles dependency. Registered in `adjustments.yml` as `itempiles-rarity-i18n`,
  `retire_class: safe`, `native_when: itempilesdnd5e release reads DND5E.ITEM.Rarity.*`.
- Nothing else in dropbin changes; test it with `tokenSizeSync` on (corpse piles keep the dead
  NPC's size; a pile converted from a locked Hotspot keeps 0.5).

**foundry/adjustments.yml**

- `dnd5e-chat-card-flags` → rename to `dnd5e-chat-message-types`; files add
  `foundry/module/pentaryn-aoe/areas.mjs`, `effects.mjs`; markers
  `["message.type", "system.targets", "system.origin", "getAssociatedActivity"]`; `what`: reads
  `message.type` / `message.system.{activity,item,targets,origin,onSave,ability}` on dnd5e 6 chat
  messages. The old `flags.dnd5e` markers would vanish and fail
  `make foundry-adjustments-check`.
- `dnd5e-importer-gate`: `what` says `"6.0"`; markers unchanged.
- New `dnd5e-legacy-roll-modes` (aoe `resolve.mjs`, `settings.mjs`; ties `study.mjs`; marker
  `_mapLegacyRollMode`; `retire_class: safe`; `native_when: dnd5e maps legacy roll-mode names
  before handing them to core`).
- New `dnd5e-token-size-lock` (aoe `areas.mjs`; marker `lockSize`; `retire_class: guarded`).
- New `dnd5e-sense-vision-reset` (senses `migrate.mjs`; marker `sightReset`; `retire_class:
  safe` once every world has run it).
- New `itempiles-rarity-i18n` (above).
- `dnd5e-armor-proficiencies`: unchanged (`equipment.mjs:179-189` is the same in 6.0.6).
- `argon-*` rows: unchanged; add to each `what` a note "dnd5e 6.0.6: no change needed; Argon
  reads `checkBonus` through a dnd5e shim removed in 6.2".

**Bridge fork** (`~/Documents/GitHub/foundry-vtt-mcp/packages`, branch `pentaryn`; the working
tree already has uncommitted edits in `settings.ts` and `eval-js.ts` — leave them alone)

- `mcp-server/src/tools/compendium.ts:1069, 1332`: `system.rarities?.length ?
  [...system.rarities].join("/") : system.rarity` (index entries are raw data; only live
  documents have the getter). `:1318-1320`: `const movement = system.attributes.movement.speeds
  ?? system.attributes.movement`.
- `foundry-module/src/data-access.ts:3867-3890`: when `keys.includes("speeds")`, also skip the
  enumerable legacy keys `walk burrow climb fly jump swim` (cosmetic; they warn on read).
- Pre-existing bugs, fix while there: `data-access.ts:5812` `.save` is an object → `.save.value`
  (fallback `.save?.value ?? .mod`); `:5818` `init.mod` → `init.total`.
- `data-access.ts:8254-8287` create-npc: leave the legacy shapes (migrated on create); comment it.
- Version bump per the fork's convention; rebuild; copy the built module into
  `Data/modules/foundry-mcp-bridge`; `make foundry-bridge-status` clean before stage 4.

**No code change:** walls (disabled), names, pings, journal, lookup, creatures, portals,
movement (cursors and attunement turned out to need small fixes — see "Review of the port"; lookup,
creatures, portals and movement only got manifest bumps). Live checks only: movement's ghost tool against the new
`Token5e#findMovementPath` (`canvas/token.mjs:31-47` ignores `ignoreTokens`, but the block itself
is still `constrainMovementPath`, which honours it); attunement's `armorProficienciesMap` patch;
creatures' libWrapper targets; portals' teleport pair.

### Retired because dnd5e 6 does it (checked)

| Ours | Native | Case checked |
|---|---|---|
| ~~`pentaryn-aoe/escape.mjs`~~ **kept (review)** | `canvas.regions.placeRegions` + core Escape (`regions.mjs:1011-1016`, `_cancelPlacement :1201`) | ours did nothing as written (`canvas.templates.preview` never fills) — but core's DEFERRED dismiss closes every open window (client-keybindings.mjs step 4) before it reaches the layer (step 5), and dnd5e minimises the casting sheet for the placement, so the first Escape closes the sheet. Ported instead: PRIORITY binding → `canvas.regions._cancelPlacement()` (row `core-region-placement-escape`) |
| `pentaryn-senses` darkvision → `sight` | `senseVisionSync` (`documents/token.mjs:75-145`) | covers more senses; does not clear a removed sense → the one-shot reset |
| aoe handle "skip" for emanations (new rule, not a retirement) | emanations attach to the caster (#6436) | handle would detach; skip attached non-handle regions |
| GM-only effects tray | `allowPlayerEffectsTray` | Part D auto-apply and highlight stay (not native) |

**Checked and kept:** area ownership (regions still created owned by the author), concentration
cleanup (areas are not concentration dependents), Part B (native outcomes cover only recorded or
selected targets, not "everyone inside the area", not NPC auto-rolls, not the confirm tray),
Part C (no auto-damage-on-hit setting exists), dropbin corpses (`autoApplyDowned` stays none).

### Review of the port (adversarial, Opus, 2026-10-10)

Every stage-2/3 diff was read against a fresh 6.0.6 download (tag tarball + release zip) and core
14.369. Gates after the fixes: all `make foundry-<m>-check` green (aoe 126 node tests), walls 49,
`make foundry-adjustments-check` 21 rows, `pytest scripts/tests` 485 passed / 2 skipped, bridge
vitest 125.

**Fixed in review**

1. **No handle on any dnd5e 6 area** (`aoe/areas.mjs` `createHandle`). `TemplatePlacement.fromActivity`
   creates the region with no `elevation` and `levels: [canvas.level.id]`; core
   `RegionDocument#prepareBaseData` makes the null bottom `-Infinity`, and the handle token was given
   `elevation: region.elevation.bottom` → "must be a finite number", no handle, Part A dead (5.3.3
   regions came from core's MeasuredTemplate migration with bottom 0, so it never showed). The
   handle was also created on the scene's initial level and the region then moved onto it. Now
   `core.handleVertical`: the region's level, its source bottom, else that level's
   `elevation.base`, else 0; a levelled region keeps its level. 7 node tests.
2. **Eraser icon inside the Properties pills** (`aoe/areas.mjs` `actionRow`). card-rows.hbs renders
   `section.icon-row > ul.pills.unlist` above the actions row; any viewer who cannot see the card's
   buttons (`visibility: "creator"` — every other player) got the icon in the pill list. `.pills`
   is excluded now (senses' Light card already did this).
3. **Part E kept** (`aoe/escape.mjs`). Core's `dismiss` is DEFERRED and closes every open window
   (client-keybindings.mjs step 4) before it reaches `_onDismissKey` (step 5); dnd5e's
   `BasePlacement#place` minimises the casting sheet, so the first Escape closes the sheet and the
   preview keeps following — the original table complaint. Ported to a PRIORITY binding that calls
   `canvas.regions._cancelPlacement()` only while `_placementContext` is set. Lang keys back,
   row `core-region-placement-escape` (guarded: core internals), 5 node tests.
4. **Effects highlight resolved every card on render** (`aoe/effects.mjs` `pendingFor`). Cards older
   than the hour are answered before `system.getEffects()` (an async `fromUuid` per card, a pack
   fetch for `dnd5e.effects` uuids) — after the migration the whole log renders at once.
5. Docs: the plan rows above (Retired table, suite 2 rows 1 and 3, principle 2, the no-code list);
   aoe README / `context/foundry/aoe.md`; `context/foundry/markers.md` gains the lockSize rule for
   new hotspots/markers (pre-flight only locked what existed).

**Checked and correct as ported:** `_mapLegacyRollMode` reaches core as `messageMode`; saves threaded
under the usage card land in `outcomes` (keyed by the speaker token) and the tray's `#saveMultiplier`,
and the request card still links by `flags.dnd5e.requestResult`; `keysOnly(event)` keeps buildPost
from re-pointing `system.origin`; riders seeding matches `getTargetOptions`/`getMergedOptions` (the
spread copies the symbol marker, the GM's untick holds, Apply uses it); only ActiveEffects are
concentration dependents, so the area cleanup is still needed and never double-deletes; concentration
effects keep `origin = item.uuid` plus `flags.dnd5e.item.uuid`; handles are SECRET, so dnd5e's
ApplyActiveEffect region behaviour and creature blocking skip them; the world migration updates
scenes and actors by diff, so the senses sight reset running alongside it is not overwritten;
`chatCardSummary` renders summaries through `system.render` (no `renderChatMessage`), and only save
and check messages have a summary template; transform settings/preset, `transform.uuid` flag,
`transformInto(source, settings)` and the expired-effect delete (6.0 #5067) are all handled.

**Risks left for install / stage 5**

- Bridge backend (broker pid 47805) still runs the pre-port server code: restart it before suite 3
  row 10; the module half only needs a client reload. **Done 2026-10-10:** broker restarted (SIGKILL, respawned as pid
  12475 on the rebuilt `dist/`), the GM tab reconnected with `foundryMCPBridge.restart()`, and
  `get-character` Talo now returns `movement.speeds` `{walk: 35, jump: 5}`.
- `chatCardSummary` (client, default on): every save linked to a usage card — ours and dnd5e's own —
  disappears from the log into that card; GM-mode NPC saves are summarised for the GM only.
- Migrated 5.3.3 usage cards render their stored `content`: our icons get a freshly built action
  row there, and an old 0.1.0 riders flavor suffix can sit beside the new note (cosmetic, old cards).
- ~~The aoe tray's "would land" preview calls `calculateDamage` without `originatingMessage`, so an
  Elemental Adept ignore is not shown in the preview (pre-existing; Apply is right).~~ **Fixed
  2026-10-10 (cards suite):** `tray.mjs` passes the damage message, as Apply does; Mage B (fire
  resistant) previews 32, not 16, under Marrith's Elemental Adept.
- **Two sessions on the GM account (found by the cards suite, fixed 2026-10-10).** The bridge tab
  plus any GM browser tab are both `activeGM.isSelf` and both the creator of what the GM places.
  Live: one Fireball got two handle tokens (deleting the unattached twin then took the area with it,
  core's stale `attachments.regions`), two DEX saves per monster that could disagree, two request
  cards, and Mage Armor applied twice. Now the handle's token `_id` is the region's id (`keepId`;
  the server refuses the second), and `resolve` / `selfApply` elect one client with
  `hooks.claimMessage` (last writer of `flags.pentaryn-aoe.claims.<job>` wins after 750 ms).
  Verified live with two patched GM clients: 1 handle, 1 save per monster, 1 request card, 1 Mage
  Armor. A client still running older code keeps producing its own copy until it reloads.
- Escape now leans on core internals (`_placementContext`, `_cancelPlacement`); the row is guarded.
- `pentaryn-transform`'s form-mode guard refunds after the use is spent (not in pre-use).

### Post-upgrade one-shots (stage 5, before the suites)

1. GM console clean after each world's migration; `game.settings.get("dnd5e",
   "systemMigrationVersion") === "6.0.6"` in all four worlds.
2. `pentaryn-aoe.npcSaveRollMode` migrated (`gm`), `pentaryn-senses.sightReset === 1`.
3. Audit: re-run the pre-flight size comparison; any token whose size changed is restored from
   `.state/core-rollback/token-sizes-pre-dnd5e6.json` and locked.
4. `game.settings.set("dnd5e", "allowPlayerEffectsTray", true)` in pentaryn (and the other
   worlds if they are played).
5. `pentaryn-seafoot-maps`: its scene pack was migrated and its module files rewritten — open one
   entry to confirm, note it in `context/pentaryn.md`.
6. Confirm Talo's Wild Shape activity: `transform.mode === "cr"`.

### Rollback criteria

Joe's rule: roll back **only** when Argon is truly broken. Everything else is fix-forward.
"Truly broken" means a player at the table cannot play from the HUD, for any of the three PCs,
and the cause is in Argon or dnd5e rather than in a pentaryn module (pentaryn-transform's
hooks are disabled for the test when in doubt: `game.modules.get("pentaryn-transform")` off, reload,
re-check).

**Rollback triggers (any one, reproduced after a reload with pentaryn-transform disabled):**

1. The HUD does not open for a PC token (no HUD after select, or an exception in the HUD's
   render that leaves it blank), on the GM client or the player client.
2. The Action, Bonus or Spell panels render with no items for a PC that has them, or every button
   in a category (weapons, spells, features) throws on click or does nothing. The audit's
   specific case: special actions failing to build empties the whole Action panel.
3. A click on a weapon attack, a spell or a class feature from the HUD neither rolls nor opens the
   usage dialog, and the same item works from the sheet (that isolates it to Argon).
4. A console error loop or exception on every combat turn / target change that stops the HUD
   updating (HP, slots, pips) for the rest of the session.
5. Combat start / end-turn from the HUD fails to advance the tracker.
6. Not Argon, but also a rollback: a world fails to open on 6.0.6, or the migration errors and
   leaves actors or items unreadable (the "Core flows" rule in `foundry-update-2026-10.md`).

**Accepted and noted (not triggers):** the `checkBonus` deprecation warning; tooltip or theme
styling; blank weapon/consumable subtitles, missing weapon properties, `details.race` object in
the portrait, special actions not spending the action pip (all pre-existing on 5.3.3); movement
bar off for crawl/blink/displace (pre-existing); items hidden by effects still listed; Item Piles
raw i18n keys (shimmed) and rarity glow on multi-rarity items; anything inside a pentaryn module.

**Stop and ask Joe, not a rollback:** Item Piles cannot take, buy or transfer at all (Joe scoped
rollback to Argon; the alternative is disabling the adapter or pinning Item Piles). Record the
console, do not decide alone.

### Playtest script

Run in **pentaryn** on Drow Prison with the GM bridge tab plus one GM Chrome tab and one player
tab (Talo's user, then swap to Marrith's and Caven's for their suite rows), all on localhost.
Tick in the per-stage report; every failed row names the console error and the module. Close
every tab you open when the suite ends.

**Suite 1 — Argon (every PC; rows 1-14 for Marrith, Caven and Talo in turn, logged in as that
player; the GM client repeats 1, 4 and 9 once).** PCs: Marrith Ashcroft `RNDTDBlFXxZ7Uc8i`
(Sorcerer 12), Caven Calderon `IxcfWOvpcKID6bdn` (Wizard 12), Talo `pfCQRWnqsQjkZQnB` (Druid 12).

1. Select the PC token: HUD opens; console has no uncaught error. Portrait shows name, HP equal
   to the sheet (`hp.value/max`, temp), AC equal to the sheet (18 / 12 or 15 with Mage Armor /
   17).
2. Movement bar: pips = walk speed ÷ grid (30 ft → 6). Give the PC a fly speed via an effect
   (`system.attributes.movement.speeds.fly` 60), re-select: pips update; remove it.
3. Action panel lists weapons, prepared spells by level, features; Bonus and Reaction panels fill;
   Dash/Disengage, Dodge/Ready, Hide/Shove present.
4. Weapon attack from the HUD: attack card posts (`message.type === "attack"`), then with
   `autoDamageOnHit` a damage card threads under the usage card on a hit against a drow NPC.
5. Cantrip from the HUD (Marrith: Produce Flame or Elementalism; Caven: Fire Bolt; Talo: any):
   usage card, attack/damage or save flow completes, no slot spent.
6. Leveled spell with a slot (Marrith: Scorching Ray; Caven: Magic Missile; Talo: Cure Wounds):
   slot pip decrements on the HUD and sheet; spell slot tooltip reads correctly.
7. Class feature with uses (Marrith: Sorcery Points / a Metamagic; Caven: Arcane Ward or Arcane
   Recovery; Talo: Wild Shape via pentaryn-transform): uses decrement; the HUD rebuilds.
8. Dodge: card posts, Dodging status on the token; Hide and Dash likewise; clear them.
9. Drawer: ability checks, saves and skills roll; the Check column equals the sheet's check bonus
   for an ability that has a bonus effect (watch for the `checkBonus` warning only).
10. Tooltips on a weapon, a spell and Dodge are readable in light and dark theme (note, not
    trigger).
11. Combat: start combat with the PC and two drow, roll initiative from the HUD, End Turn
    advances; action pips reset on the new round.
12. Rest buttons on the HUD: short rest dialog opens; cancel.
13. **Talo only:** Wild Shape tile → pick Brown Bear → shift: form's attacks fill the front row,
    "Return to Talo" and "Change Form" on the Bonus bar, portrait shows the form and temp HP;
    revert. Starry Form Dragon with Twinkling: fly speed 20 on the movement bar; the effect ends
    on Incapacitated.
14. Player client (a tab that joins after combat started must first switch Argon on: the token
    controls toggle, or `ui.ARGON.toggle(true)`; Argon only self-enables on combat start, see
    `context/foundry/ops.md`): the same PC's HUD on the player tab opens and attacks; the player sees no
    GM-only roll (ties Study, NPC saves).

**Suite 2 — cards (aoe, riders, senses, ties, transform) as GM with one player tab.**

1. Marrith casts Fireball at a cluster of drow: Place Template → a region with
   `flags.dnd5e.activity`, no `flags.core.MeasuredTemplate`, `ownership.default` 3, a 0.5
   handle named "Fireball (Joe)" attached, on the level the area was placed on. Escape during
   placement cancels on the FIRST press while the casting sheet is open (pentaryn-aoe Part E, not
   native: core's Escape would close the minimised sheet first). Drag the
   handle: region moves; the player tab can drag it too. "Remove all templates" icon button in
   the usage card's icon row removes it.
2. Place it again; roll damage: our GM tray lists every creature inside, NPC saves roll with
   `gm` mode (player tab sees nothing), Caven/Talo inside get the request card and their roll
   fills the row, Apply applies full/half; the native usage card `outcomes` show the same saved /
   failed set, and the native damage tray's half pill agrees. Supersede by re-rolling damage: old
   resolution marked superseded.
3. Riders on that Fireball: Marrith's Elemental Adept note appears on the damage card (A3); 1s on
   fire dice count as 2; against a fire-resistant NPC the tray starts with resistance ignored, the
   GM unticks it, re-calculates, the untick holds, Apply uses the unticked value. Once per casting
   is tested with **Scorching Ray** (a second ray's damage gets no second +CHA); a re-rolled
   Fireball damage from the same card does get it again, by the module's documented design
   (riders core test 74, README). Talo's Potent
   Spellcasting adds WIS on a cantrip.
4. Emanation: an emanation activity (Spirit Guardians added to a scratch NPC from the PHB pack)
   attaches to the caster natively; no handle is created; moving the caster moves it; delete the
   scratch NPC.
5. Concentration: cast a concentration area spell (Caven: Web), place it, end concentration from
   the sheet: region and handle go on every scene.
6. Attack-hit auto damage (Part C) from a sheet attack and from Argon; a miss rolls nothing.
7. Effects (Part D): Caven casts Mage Armor on himself with no target: effect auto-applied, the
   "applied to Caven" line shows; cast Bless (any PC) at two targets: tray highlighted until
   Apply from the tray with targets selected; a mere row click does not mark it applied; applying
   from the native tray with `allowPlayerEffectsTray` on works from the player tab.
8. Light cantrip card: "On me" / "Pick a target" / "End" icons in the card's icon row, no
   `placeSummons` button; On me lights the token; End clears; torch Light/Douse on the sheet
   still works.
9. Darkvision: a drow NPC token with sight enabled sees 120 ft in the dark with stored
   `sight.range` 0 (native); put Goggles of Night on Caven and equip: token sees 60; unequip:
   token is dark again (the one-shot reset ran: no stored `darkvision` sight left on PC tokens).
10. Ties Study: a blind Study roll from a PC's token HUD is invisible on the player tab and the
    result reaches the fact (A1).
11. Save requests from the Request card for an absent player: "roll for them" works with the
    dialog.
12. Chat cards from before the upgrade (migrated messages) render without errors; our
    resolution trays on old damage messages render or are hidden cleanly.

**Suite 3 — modules (everything else).**

1. Item Piles, as GM then player: drop an item on the canvas → pile; Take stacks quantity; open
   a merchant with an uncommon, rare and very rare item: Rarity column shows words (shim), an
   unidentified item shows "Unknown"; buy and sell with sp/cp prices; vault glow colours; "Give
   to character" from the context menu; a container inside a pile transfers its contents; a spell
   dropped on a pile becomes a scroll. The Confiscated Belongings Hotspot still opens at 0.65.
2. dropbin: kill a drow (HP 0): corpse pile with the eye, size unchanged, loot and ledger work,
   `noLoot` respected; `autoApplyDowned` still none.
3. Token sizes: the pre-flight audit re-run shows no unintended resize; Markers 0.25, Hotspots
   0.5/0.65, handles 0.5; PCs 1x1; a Large NPC placed fresh is 2x2.
4. Falling: on a Levels scene, a handle attached to a region at elevation 10 does not get
   Falling; a drow moved off a ledge does; a flyer does not.
5. Transform: suite 1 row 13 plus exhaustion carried back from a form; a non-Wild-Shape
   Polymorph while shifted is still blocked.
6. Importer: `make foundry-actors` then `make foundry-import DRY=1` (or the equivalent): gate
   passes on 6.0.6, zero actors changed.
7. Attunement: slots render under the stats block; dragging a seventh attunement warns; Item
   Piles Take of an attuned item repairs it; the armorProficienciesMap patch still applies (a
   PC in a non-mapped armour type reads proficient).
8. Creatures, portals, movement, cursors, pings, names, journal, lookup: open the Prison ↔
   Fighting Pit teleport pair, ghost-move a PC through a wall and a token with the ghost tool
   (blocked without it), creature sheet reskin renders, a ping and a cursor show on the other
   client, a name is generated, a journal page with our styling renders, lookup opens a PHB
   entry.
9. `pentaryn-seafoot-maps`: import one scene from the migrated pack.
10. Bridge: `get-character` on Talo returns `movement.speeds` and readable items; `use-item`
    casts a cantrip; `request-player-rolls` posts a request; `search-compendium` for a magic item
    shows a rarity word; `eval-js` works. `make foundry-bridge-status` clean.
11. The other three worlds: launch each, migration completes, a sheet opens, back to pentaryn.
12. Updater: `.state/vtt-update.pause` still present; `foundry/update-policy.yml` untouched
    except a note that dnd5e 6 is now in; the go/no-go section of `foundry-update-2026-10.md` gets
    a "superseded 2026-10-10" line pointing here.

### Cleanup (end of stage 6)

**Baseline to restore to, not a full refill.** The pre-upgrade world tar (read 2026-10-10 with
classic-level) already had these values, so they are campaign state, not migration artefacts:
Marrith spell1 5/4, spell2 2, spell3 2, spell5 1, Font of Magic 4 spent, Innate Sorcery 2
spent, Pearl of Power 1 spent, Wand of Fireballs 2 spent; Caven spells 2/0/0/0/1/0 (L1-L6),
Arcane Ward 29 spent, Ring of Spell Storing 2 spent, Mage Armor and Imperceptible Barrier
effects; Talo all slots full, Cosmic Omen 1 spent, effect "Concentrating: Summon Elemental"
(created 2026-10-09 01:41). Restore test spending back to these values, and leave these values
as they are.

Delete every test chat card (migrated ones stay), restore spent slots and uses on the three PCs
(Marrith sorcery points, Caven Arcane Ward/Recovery, Talo Wild Shape uses), remove the scratch
NPC, every test region, handle, template and token, end and delete the test combat, clear
Dodging/Hidden statuses, delete the scratch scene if one was made, set Drow Prison active and
paused, close every Chrome tab opened by the stages (never the GM bridge tab). `git status` must
show only the intended module, script, adjustment and context files; no commit.

## Outcome (2026-10-10): KEPT dnd5e 6.0.6

No rollback trigger fired. The pentaryn world migrated cleanly (226 actors, 449 chat messages,
16 scenes; `systemVersion` 6.0.6); all 17 `pentaryn-*` module folders in `Data/modules` match
the repo; 41 modules active (only `pentaryn-walls` off, as before). The other three worlds
(ardenford, ardenhaven, space-journey) were **not launched on 6**: they migrate on first launch.

**Argon live suite (real HUD clicks, GM tab plus Caven player tab) passed** for Marrith, Caven
and Talo: HUD opens, Action/Bonus/Reaction/Special/spell panels fill, weapons, cantrips and
leveled spells roll and spend slots, class features spend uses, End Turn advances the tracker,
Talo's Wild Shape shift/revert and Starry Form work. No Argon console error.

**Per-module changes and the retired-for-native list** are in "Per-module changes" and
"Retired because dnd5e 6 does it (checked)" above; the review findings are in "Review of the port".
Backups: see "Backups" (OneDrive `pre-dnd5e6-2026-10/`, `.state/core-rollback/`).

### Accepted degradations (not rollback causes)

- `checkBonus` deprecation warning from the Argon drawer Check column; the shim goes in dnd5e 6.2,
  after which the column shows the bare modifier.
- Movement pips read `attributes.movement[mode]` through a compat getter and follow the token's
  `movementAction`; crawl, blink and displace show 0 (same as 5.3.3).
- dnd5e 6's new `form` transform mode never sets `isPolymorphed`, so Argon and
  `pentaryn-transform/hud.mjs` would not see it. Talo uses mode `cr`. Fix only if `form` is adopted.
- Effect-hidden items (`hiddenItems`) are still listed in Argon ("Usage not allowed"); unused today.
- Light-theme tooltips unchecked (dnd5e 6 dropped `DND5E.themes`); dark theme is readable.
- Pre-existing on 5.3.3: blank weapon/consumable subtitles, weapon properties not shown,
  `details.race` object in the portrait, special actions not spending the action pip, range/target
  getters throwing on items without activities.
- No Roll Initiative control on the Argon HUD (use the tracker); Scorching Ray tooltip says
  "Total Rays: 1" before casting (card is right).
- Item Piles: raw i18n keys (shimmed by `pentaryn-dropbin/i18n-shim.mjs`); rarity glow takes the
  first of several rarities; **takes duplicate or lose items when several GM tabs are logged in**
  (keep exactly one GM client).
- Duplicate-delete/create console errors and a doubled dropbin ledger number appeared while
  several GM clients were acting; unconfirmed on a single-GM table.

### Still open after this stage

- Suite 2 (cards flows) never ran on 6; the player-tab check that players never see a GM-only roll
  was only partial. The three other worlds are unlaunched on 6.
- Post-upgrade one-shots 3-6 above (token-size audit, `allowPlayerEffectsTray`, seafoot-maps check,
  Talo `transform.mode`).
- Leftovers: Caven "Allosaurus" token `3MOg1yNcRGsrJtBj` has no texture (pre-upgrade Wild Shape,
  `img: null`; art is in `previousTokenData`); an expired suppressed "Imperceptible Barrier" effect
  on Caven; 493 chat messages with mixed test cards; the bridge broker needs a restart and a GM
  client must log back in before MCP tools work.
- The updater stays paused (`.state/vtt-update.pause`).

## Rollback

Use when Argon is truly broken on dnd5e 6 (criteria above). This returns **all four worlds, Config and every
module** to the 04:19 state and the system to 5.3.3. Anything done in any world after
2026-10-10 04:19 is lost — export it first if it matters. Partial rollback (system only) is
**not** safe: once a world has been launched on dnd5e 6 its data is migrated, and 5.3.3
must not open it.

```sh
REPO=/Users/joe/Documents/GitHub/pentaryn
FD="$HOME/Library/Application Support/FoundryVTT"
PIN="$HOME/Library/CloudStorage/OneDrive-Personal/DnD/foundry/pre-dnd5e6-2026-10"
SNAP="$PIN/world-2026-10-10-041914-fvtt14.369.tar.gz"
cd "$REPO"

# 1. Stop. vtt-down also takes a "shutdown" snapshot of the dnd5e-6 state: that is the
#    safety copy of what you are about to throw away. Close game tabs first (never the
#    GM bridge tab while it is still needed; after stop it is dead anyway).
make vtt-down
make vtt-status                       # must say  foundry: down

# 2. Verify the archives before deleting anything (also forces OneDrive to hydrate).
(cd "$PIN" && shasum -a 256 -c SHA256SUMS-pre-dnd5e6)
tar -tzf "$SNAP" >/dev/null && echo world-ok
tar -tzf .state/core-rollback/system-dnd5e-5.3.3.tar.gz >/dev/null && echo system-ok

# 3. System folder back to 5.3.3.
rm -rf "$FD/Data/systems/dnd5e"
tar -xzf .state/core-rollback/system-dnd5e-5.3.3.tar.gz -C "$FD/Data/systems"
grep '"version"' "$FD/Data/systems/dnd5e/system.json"        # → 5.3.3

# 4. Worlds + Config + modules back (clear first: tar overlays, it never deletes files the
#    newer tree added, which would leave a mixed-version install that looks fine).
rm -rf "$FD/Data/worlds" "$FD/Config" "$FD/Data/modules"
tar -xzf "$SNAP" -C "$FD"
grep '"systemVersion"' "$FD"/Data/worlds/*/world.json        # → 5.3.3 for all four
grep '"version"' "$FD/Data/modules/enhancedcombathud-dnd5e/module.json" \
                 "$FD/Data/modules/itempilesdnd5e/module.json"  # → 5.2.2, 1.1.0

# 5. Our modules from git HEAD. Step 4 already restored the pre-port copies; this makes the
#    repo match them and proves it. Park the port work first so it is not lost.
git stash push -u -m "dnd5e6-port $(date +%F)" -- foundry/module scripts automation
for m in aoe attunement creatures cursors dropbin journal lookup movement names \
         portals riders senses ties transform walls; do
  make foundry-$m-sync || echo "SYNC FAILED: $m"
done
# pings and importer have no sync target (importer is staged by the actor pipeline):
for m in foundry/module/pentaryn-*; do
  diff -rq --exclude='*.md' "$m" "$FD/Data/modules/$(basename $m)" && echo "ok $(basename $m)"
done                                   # every module must print ok

# 6. Keep the updater from re-installing 6: leave .state/vtt-update.pause in place and add
#    dnd5e to `hold:` in foundry/update-policy.yml (next to foundry-mcp-bridge).
ls -la .state/vtt-update.pause

# 7. Restart locally only. NO tunnel.
make foundry-up
make vtt-login WORLD=pentaryn
```

**8. Verify** (from the bridge, `eval-js`, after the GM tab is connected):

```js
({ core: game.version, system: game.system.version,             // 14.369 / 5.3.3
   worldSys: game.world.systemVersion,                           // 5.3.3
   argon: game.modules.get("enhancedcombathud-dnd5e")?.version,   // 5.2.2, active
   piles: game.modules.get("itempilesdnd5e")?.version,            // 1.1.0, active
   active: game.modules.filter(m => m.active).length })           // 41
```

Then compare the active list against `enabled-modules-pentaryn-pre-dnd5e6.json`, select a
PC token and confirm the Argon HUD opens and an attack rolls, open an Item Piles pile, and
read the console for errors. Return to Drow Prison, paused. Close every tab you opened.

If the port work should be kept for a later retry: `git stash list` shows
`dnd5e6-port …`; leave it there.

- **2026-10-10 follow-up:** the other three worlds (ardenford, ardenhaven, space-journey) were launched and migrated cleanly to 6.0.6 (ardenford 75 actors/52 msgs/119 scenes; ardenhaven 23/5/4; space-journey 140/544); all four `world.json` read systemVersion 6.0.6. Pentaryn test leftovers cleaned: 48 chat messages removed (446 kept), Caven's expired "Imperceptible Barrier" deleted (AC 15), Marrith slot and Talo temp HP restored, Item Piles default pile recreated. Exports in `.state/core-rollback/cleanup-2026-10-10/`. Kept for review: Caven Allosaurus actor/token, Talo's Concentrating: Summon Elemental effect, Circle of Death handle, Velkyn's lost Bloodied effect.
