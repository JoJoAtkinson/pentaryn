---
title: "Pentaryn — campaign state"
status: active
created: 2026-10-04
last_modified: 2026-10-17
tags: [context, campaign, pentaryn, campaign-state]
---

# Pentaryn — campaign state

**Read this when:** building or running the Pentaryn world in Foundry — what exists, which
modules are on or off and why, where the crowd and marker actors live, what is still unbuilt.
**Not this file:** how Foundry works → [`foundry/README.md`](foundry/README.md) · world creation
method → [`foundry/ops.md`](foundry/ops.md) *Creating a new world* · other campaigns →
[`space-journey.md`](space-journey.md), [`ardenford.md`](ardenford.md)

> **Volatile file.** Dated findings and IDs belong here.

Foundry world id **`pentaryn`**, title **Pentaryn**, dnd5e 6.0.6 on core 14.369 (both since 2026-10-10), rules
`modern` (2024). This is Joe's main Pentaryn world build. First use: a 3200 A.F. Underdark
one-shot with PCs Marrith, Caven and Talo (built to level 12, 2026-10-04).

## Backups — per-module bundles live (2026-10-12)

Backups are now a ~19 MB world snapshot plus shared module/system bundles in OneDrive
`DnD/foundry/bundles/` (how they work: [`foundry/ops.md`](foundry/ops.md) §3). The confirmed
snapshot from go-live is `world-2026-10-12-030832-fvtt14.369-mac.tar.gz`, which names 46
bundles. Evidence: [`plans/module-bundles-acceptance-2026-10-11.md`](plans/module-bundles-acceptance-2026-10-11.md).
The old full snapshot is kept in `DnD/foundry/pre-bundles-2026-10/` until Joe deletes it. BOSS
has not booted from bundles yet.

## 2026-10 update (2026-10-10)

Attended update after the unattended 10-03 run crashed partway. Plan and rationale:
[`plans/foundry-update-2026-10.md`](plans/foundry-update-2026-10.md).

| Component | Before | After |
|---|---|---|
| Foundry core | 14.367 | **14.369** |
| dnd5e | 5.3.3 | 5.3.3 (6.0.6 held at the time — later the same day upgraded to **6.0.6**, see *dnd5e 6.0.6 upgrade* below) |
| Dice So Nice | 6.4.2 | **6.4.4** |
| Multi Token Edit | 3.3.7 | 3.3.7 (already current) |
| mad-endlesswiz2 | 13.0.1 | **14.1.0** (installed through `installPackage` on the licence; no pentaryn scene uses it) |
| foundry-mcp-bridge | 0.8.3 (fork) | 0.8.3 (upstream 0.8.4 pinned out) |
| pentaryn-portals | 0.4.0 | **0.4.1** (same-scene relative destinations) |
| pentaryn-ties | 0.19.0 | **0.19.1** (14.369 flag-delete form; Dice So Nice `skip` flag) |
| pentaryn-lookup | - | canary now checks the `indexDocument` cause (selftest 10/10) |

All four worlds (pentaryn, ardenford, ardenhaven, space-journey) migrated on first launch to
14.369 / 5.3.3 with no console errors. Snapshot:
`world-2026-10-10-011351-fvtt14.367.tar.gz` in OneDrive `DnD/foundry/world-backups/`
(reason `pre-update-2026-10`; also copied to `DnD/foundry/pre-update-2026-10/`). Core rollback
bundle: `.state/core-rollback/app-14.367.tar.gz`. Foundry per-package backups:
`module.dice-so-nice.2026-10-10.*` (6.4.2) and a mad-endlesswiz2 13.0.1 backup.
Console warnings left are deprecation notices from scene-packer / lib-wrapper (mad-endlesswiz2
welcome journal) and two core notices; nothing broken.

## 2026-10-04 — world created

Built from `space-journey`'s setup (same recipe as `ardenford`). A snapshot of space-journey
was taken first (scratch `.tgz`, not in the repo). World was created via `POST /create`, then
settings were copied on disk with classic-level while both worlds were closed.

- **Splash:** `Data/assets/splash/pentaryn-splash.webp` (PNG original alongside), the Pentaryn
  continent map. Set as the world `background`; shows on setup and join screens.
- **Users:** Gamemaster only (role 4). Its password hash was copied on disk from space-journey
  without being read or printed. No player users.
- **State:** 0 scenes, 0 journals, 31 actors, 1 macro ("Ties Web", auto-created by
  pentaryn-ties). Tunnel not started.

## Modules

**31 enabled**, versions matching space-journey (mad-endlesswiz2 on 14.1.0, installed by hand), plus gm-vision:

- Libraries/UI: lib-wrapper, socketlib, dice-so-nice, multi-token-edit, theripper-premium-hub
- Rules: dnd-players-handbook, dnd-dungeon-masters-guide, dnd-monster-manual
- Combat HUD: enhancedcombathud, enhancedcombathud-dnd5e
- Item piles: item-piles, itempilesdnd5e
- Scene stack: levels, wall-height, betterroofs, monks-active-tiles, tile-scroll, scene-packer
- Props: fa-nexus 0.5.3 (added 2026-10-17, filesystem drop; Forgotten Adventures' browser that
  drops furniture as tiles). Free prop packs `tiles-02` (Tom Cartos) and `tiles-03` (FA) — see
  [`foundry/props.md`](foundry/props.md)
- Map packs: eledryll-maps-castle-life-bundle-1, eledryll-spiders-tear-opera-house,
  mad-endlesswiz, mad-endlesswiz2, pentaryn-seafoot-maps
- Bridge: foundry-mcp-bridge
- GM view: gm-vision 2.0.5 — **Ctrl+G** toggles a GM-only lit view through darkness and fog
  (the Underdark scenes are locked at darkness 1). Players' view is untouched. Added
  2026-10-04 by filesystem drop (ops.md §5 path B); not in space-journey
- Custom: pentaryn-attunement, pentaryn-dropbin, pentaryn-importer, pentaryn-lookup,
  pentaryn-pings, pentaryn-ties, pentaryn-senses (added 2026-10-05: token vision follows sheet
  Darkvision; goggles off = blind on the map), pentaryn-names (added 2026-10-05: renaming an actor renames
  token labels that were its name or the part before its first comma; nicknames are kept),
  pentaryn-transform (added 2026-10-05: 'Return to Normal Form'
  ability reverts Wild Shape from the sheet/HUD; blocks stacked transforms),
  pentaryn-journal (added 2026-10-07: an "Add to my journal" bar on every eye readable and eye-pile
  item; copies what the player saw, secrets stripped, into `Player Journals/<name>'s Journal` and
  opens it on the new entry, highlighted. See [`foundry/module/pentaryn-journal/README.md`](../foundry/module/pentaryn-journal/README.md))
- **Custom module versions after the wave-5 go-live (2026-10-12)** (all synced and enabled):
  aoe 0.4.0, **attunement 0.3.0** (a coin purse pays whoever holds it once, about 750 ms after it
  lands; a stash that comes up short rolls its copies back), combat 0.3.0, creatures 0.1.1, cursors 0.2.0,
  dropbin 0.2.3, **feedback 0.1.2** (player bug/defect/feature reports — bug icon in token controls and
  `/bug` in chat; reviewed with the `feedback_*` tools, see [`foundry/feedback.md`](foundry/feedback.md);
  0.1.2: `inspect` takes an Actor/Token), **importer 1.1.1** (abort codes; `import` takes `dryRun`),
  journal 0.1.0, lookup 0.3.0, movement 0.1.2, names 0.1.1, pings 0.1.1, portals 0.5.0, prompts 0.4.5,
  riders 0.3.0, **senses 0.5.0** (a chain to a hidden token is not drawn for players), ties 0.19.4,
  transform 0.4.0. All **19 namespaces** answer `pentaryn-read` at blueprint kit **1.1.0** (only the
  senses `chain` alias has no `describe()`). Every sync stamp is `380a5348` (wave-5 merge).
  Bridge: foundry-mcp-bridge **0.8.3-pentaryn.2** (adds `pentaryn-read` / `pentaryn-write`), module
  built from fork `pentaryn` `2fd6eb0` (toggle-condition without `active` toggles, write-log ids,
  eval-js `phase: "args"`); the server runs `7712417` (pentaryn-read description only).
  `pentaryn-walls` 0.2.0 was retired 2026-10-13 (Joe uses prefabs): never synced, off, its
  `Data/modules/pentaryn-walls/` folder moved to the macOS Trash (defect wave 3), and then its source
  left the repo (exact copy on branch `archive/pentaryn-walls`) (below). Record:
  [`plans/merge-and-go-live-2026-10-11.md`](plans/merge-and-go-live-2026-10-11.md).
- **Pinning live (2026-10-17).** New module **pentaryn-pins 0.1.0** (pin a character to a player;
  with the world switch on, their view follows the token and ignores activation; "Pinned to" on the
  sheet; GM right-click canvas menu: Prompt note, Teleport pinned character with its summons and
  pets) plus **portals 0.6.0** (`teleportToken`), **prompts 0.4.6** (`place` takes `at`) and
  **resume 0.1.1** (the pin wins at login). All four synced (last stamp `2f0715e1`, dirty,
  18:12Z) and enabled; **Pinning** is ON and the six players are pinned to their own characters
  (Bazgar, Caven, Marrith, Marwen, Sabriel, Talo; one token each, on camp-site and the Wayward
  Compass). Keep both as they are. Using it and the live scenarios
  (`automation/smoke/pins-live.mjs`, `PinTest*` documents only): [`foundry/pins.md`](foundry/pins.md).
- **Pins 0.3.0 + portals 0.8.0 (built 2026-10-17, branch `feat/pentaryn-pins`).** The GM right-click
  canvas menu is now Prompt note, **Gather logged-in players here** (every logged-in player's pinned
  character, with its summons and pets, to the clicked point; their views follow; offline players
  stay), Teleport pinned character. A companion several players co-own (a shared steed) now comes on
  a single move only from within 10 ft of the moving character, and always on a Gather. What is
  live: `game.pentaryn.pins.describe().version`. Details: [`foundry/pins.md`](foundry/pins.md).
- **The lobby: keep "Pentaryn — Entry" active** (scene `cCHpAUuiR4zGXusB`). With Pinning on,
  activating a play map does **not** move the pinned players: it only sets what they see for a moment
  at login, before their token's scene is drawn. Unpinned players and the playlist do follow it.
  Move people by moving their tokens (portals, Teleport, Gather), and **re-activate Entry before
  players log in** (and after any session where you activated a map), so the login flash is the
  lobby. The live runner puts the active scene back to what it found (Entry) when it ends.

**Left out**

| Module | Reason |
|---|---|
| `pentaryn-walls` | **Retired 2026-10-13** — Joe uses prefabs now; the installed folder went to the Trash the same day and the source then left the repo (exact copy on branch `archive/pentaryn-walls`). Before that: Joe's instruction: do not activate the custom walls add-on. `false` in `core.moduleConfiguration`; `game.pentaryn.walls` absent. Migrated in wave 2, never live-tested, off in the world: do not sync or live-check it (W2-L1, 2026-10-11) |
| "Auto map generator" | No such module exists. The only generator is the bridge's ComfyUI `generate-map` tool: zero calls in the logs, rejected in [`plans/foundry-mcp-fork.md`](plans/foundry-mcp-fork.md). Nothing to switch off |

Retired addons that left the repo, and how to bring one back: [`foundry/retired.md`](foundry/retired.md).

**Log audit:** no add-on bugged out. Error logs were 0 bytes; the only failures were bridge
connection timeouts during build work. Nothing was excluded on that basis.

**Maps:** all 6 scene packs available, 788 scenes (DMG 24, Castle Life 27, Spider's Tear 8,
Endless Wiz 24, Endless Wiz 2 18, Seafoot 687). Seafoot is unlocked, matching space-journey.

**Settings copied (45):** `core.moduleConfiguration`, `core.permissions`,
`core.prototypeTokenOverrides` (lockRotation true), enhancedcombathud and -dnd5e settings,
multi-token-edit brush, bridge autoReconnect, pentaryn-ties playerAccess/advantageStacking,
item-piles settings (except `defaultItemPileActorID`, `populationTablesFolder`).
**Not copied:** ties attributes/beliefs/knowledge (space-journey data), migration markers.
dnd5e regenerated `core.compendiumConfiguration` itself (valid, no dangling ids).

## Cell lights (2026-10-07)

The prison has no light and every PC has Darkvision 0. Two PCs now carry light so they can see
their own story pins.

**Caven: the Shattered Amethyst Dragon Shard.**

- **Item:** loot item `k5HUO3jmXUFYa4jr` on `IxcfWOvpcKID6bdn`. It replaced the earlier
  "Cracked Glowstone".
- **Light lives on the item:** `flags.pentaryn-senses.light`. `pentaryn-senses` gives the carrier's
  tokens that light and marks them `flags.pentaryn-senses.itemLight`. If the shard leaves his
  inventory, the light goes with it.
- **Light:** purple `#9b4dff`, Dim 15 ft (the ceiling), animation `pentaryn-brokenglow` from
  `glow.mjs`.
- **The wave:**
  - Size runs from his own square up to 15 ft.
  - Brightness runs from 0.3 to 0.85. It never cuts out and never blazes.
  - The wave picks each swell's height, depth and pace at random, weighted low. Simulated over
    an hour, it averaged 4.7 ft and spent most of its time at 1–4 ft.
  - The radius is real: what he sees grows and shrinks with it.
  - Every client computes the same wave from the server clock.
- **Token moved:** his token `hY1LvBz41a8fhX3l` moved 16 px up, to y 2287. At y 2303 his eye-point
  sat right behind a bar post, which hid almost all of Marrith's cell. From the gap he sees her
  glow as slits through both sets of bars.
- **Pin:** his story pin `oX2IhzewxBUb9anj` is at (5320, 2305). It stays shown once explored, even
  when the light shrinks below it.

**Inspecting across the corridor.** A player double-clicks a creature they can see to get
"Take a closer look" (pentaryn-ties); hover + 4 does the same. Caven can inspect Marrith from
his spot, 47 ft away, because her rune glow lights her and he sees her through the bar gaps.
The menu's second item, "What I know about them", opens the player **Look window** (no roll);
"Take a closer look" opens it and then rolls. It shows only facts the character was granted, so a
failed roll looks like finding nothing (pentaryn-ties 0.18.0, README "The player's Look window").
Built 2026-10-07 by workflow (Fable/Opus/Sonnet); not yet seen with a real roll landing, the 4
key via a real keypress, or the empty-state line.

**The bars are the slits.** The cell bars are walls built as small diamond posts at x≈3895 and
x≈5098, on a ~40 px pitch. The cell doors are movement-only walls. Light and sight pass between the
posts, so glows read as slats from across the corridor, and what a PC sees depends on where their
eye lines up with the gaps.

**Your own bars don't blind you (2026-10-07).** The 114 bar posts on both lines are now
*proximity* walls for sight: `sight: 30`, threshold 10 ft. A viewer within 10 ft of a post sees
straight past it, like a prisoner with their face at the bars, and light is unchanged. The fix was
needed because the eye-point is a single pixel. With Caven back at y 2304 and Marrith at y 2303,
one of her own posts sat dead on her line to him and hid about 95% of his glow. Only the far
cell's bars now cut the view into slats. A token's centre that lines up with a far post is still
hidden behind it.

**Marrith's rune glow (same day).** Her runes glow red. Her token `MO9XFq1e8j7C9cxF` and her
prototype token have this light:

- **Shape:** `#c4231b`, dim 2.5 ft, alpha 0.35 (dimmer than Caven's).
- **Animation:** the built-in `torch` at speed 2 / intensity 2. It's a gentle, steady flicker that
  never goes dark.
- **Pin moved:** her story pin `ktdECDKoxCTspb39` moved 15 px closer, to (3672, 2308).

**Talo: Darkvision 60 ft (2026-10-07, Joe's call).** It comes from **Drow-Silk Wraps**
(`dVUfZdiSnboW6zch`): his forearm wraps from the bio, drow-enchanted, uncommon, no attunement,
equipped. Its transferred effect upgrades `senses.ranges.darkvision` to 60, and `pentaryn-senses` keeps his
token on darkvision 60. The patrol left the wraps because they look like clothes, which is also
why the feather under them was never found.

**Drow darkvision (2026-10-07):** every drow NPC actor (40 of them had 0) now has Darkvision 120
on the sheet, the 2024 drow value. The two that already had 90 (Handmaiden of the Watch, Yathrin
Zesstra) and the crowd actors at 120 were left alone. NPC token vision stays off; `pentaryn-senses`
only syncs tokens with vision enabled.

## Player journals (2026-10-07)

`pentaryn-journal` 0.1.0 is installed (`make foundry-journal-sync`) and set to `true` in
`core.moduleConfiguration`. It goes live after Joe **restarts Foundry** (module.json is read at
startup) and presses F5. No client was reloaded for him.

- **Players:** an "Add to my journal" bar appears under the letter, the cell and any eye-pile item.
  Clicking it copies what they were shown into their own journal (`default: NONE`, the player is
  OWNER, the GM can read it). The journal then opens with every entry listed and the new one glowing.
- **Nothing visible yet:** only the `Gamemaster` user exists. The GM's `ready`/`createUser` hooks
  create `Player Journals` and one journal per player as soon as player users exist. Journal names
  use `user.character`, so assign characters first or they fall back to the user name.
- **Provenance:** the scene's **navName** is used, and it is empty on the Drow Prison. The letter
  therefore reads "Found in Devil's Hold — “Letter”" (the folder name). Set a player-facing navName
  to name the place.
- **Testing from the GM client:** Settings → *Show the Add button to the GM*. Turn it off afterwards.
- **Verified 2026-10-07** in a temporary in-page harness, with everything removed afterwards and the
  world diffed back to its snapshot:
  - the bar renders, and add / dedup / update work;
  - an embed of a GM-only page renders no secret in the copy;
  - relative links are made absolute;
  - the highlight survives Foundry's own re-render;
  - the sender check rejects a GM sender and a missing sender;
  - an item preview from the Guard Footlocker copies with no secret.

  The real letter, sanitized, equals the player view: 0 of 9 secret sentences survive.

## Actors (31)

All npc, ring off, `lockRotation` on, `actorLink` false, disposition 0.

| Folder | Count | Notes |
|---|---|---|
| Markers (1–9) | 9 | "Marker · 1" to "Marker · 9"; art `assets/tokens/custom/markers/marker-0N.webp`; 0.25 grid, displayName 50. Not prototype-hidden (matches live space-journey; `foundry/markers.md` says ghosted — undecided) |
| Crowd — Surface Folk (grey) | 10 | "Villager (…)"; img `generic-villagers/villager-X.png`, subject = existing faded `ring-subjects/villager-X-faded-<hex>.webp`; 1x1, displayName 20 |
| Crowd — Drow (grey) | 6 | "Drow Commoner (crowd) 1–6" |
| Crowd — Dwarves (grey) | 6 | "Dwarf Commoner (crowd) 1–5" + "Duergar Commoner (crowd) 6" |

Crowd actors have no stat block. Actor IDs: read live (`game.actors`), not recorded here.

**Drow/dwarf art** (picked by filename, from `tokens-01/drow-dark-elves` etc.; **Joe should
eyeball them**). Written under `Data/assets/tokens/custom/`:
- `generic-underdark/<name>.png` and `<name>-faded.png` (alpha x0.8, grey portraits)
- `ring-subjects/<name>-faded-<hex>.webp`
- Drow: drow-youthful, drow-adolescent, drow-with-earrings, dark-elf, drow-determined,
  drow-with-blue-eyes
- Dwarves: dwarf-miner, dwarf-merchant, dwarf-jeweller, elder-dwarf, dwarf-1, duergar-vexed
- The drow set has no true civilian art; these are the least martial portraits.

## Player characters

| PC | Actor id | Portrait (`img`) | Token | Ring subject |
|---|---|---|---|---|
| Marrith Ashcroft | `RNDTDBlFXxZ7Uc8i` | `assets/tokens/custom/marrith-ashcroft-portrait.webp` | `assets/tokens/custom/marrith-ashcroft-token.webp` | `assets/tokens/custom/ring-subjects/marrith-ashcroft-token-67a821.webp` |
| Caven Calderon | `IxcfWOvpcKID6bdn` | `assets/tokens/custom/caven-calderon-portrait.webp` | `assets/tokens/custom/caven-calderon-token.webp` | `assets/tokens/custom/ring-subjects/caven-calderon-token-142f79.webp` |
| Talo | `pfCQRWnqsQjkZQnB` | `assets/tokens/custom/talo-portrait.webp` | `assets/tokens/custom/talo-token.webp` | `assets/tokens/custom/ring-subjects/talo-token-49d35c.webp` |

Folder `Player Characters`. Gold ring, linked, rotation locked. Full uncropped art: `assets/tokens/custom/marrith-ashcroft-art.webp`.
Full uncropped art for Caven: `assets/tokens/custom/caven-calderon-art.webp`; for Talo: `assets/tokens/custom/talo-art.webp`.
**Built to level 12 on 2026-10-04** by a design/build/verify workflow, all official PHB/DMG/MM content, real dnd5e advancement data (fixed-average HP), 2 common / 3 uncommon / 1 rare magic items each (PHB higher-level table):

| PC | Build | HP / AC / DC |
|---|---|---|
| Marrith | Human Sorcerer 12, Draconic Sorcery (fire), Hermit; Elemental Adept (fire), Resilient (Wis); Careful/Quickened/Transmuted/Empowered; Wand of Fireballs; curse **The Inward Flame** (all elemental damage → fire) | 98 / 18 / 17 |
| Caven | Human Wizard 12, **Abjurer** (no Necromancer exists in the 2024 PHB — the necromancy is in the spells: Animate Dead, Summon Undead, Create Undead), Sage; Resilient (Con), Shadow-Touched | 86 / 12 (15 Mage Armor) / 17 |
| Talo | Goliath (Stone) Druid 12, Circle of the Stars, Guide; War Caster, Fey-Touched; Staff of the Woodlands | 99 / 17 / 17 |

**Marrith is all fire (2026-10-07).** She has a curse feature, **The Inward Flame**. Any spell of hers that deals acid, cold, lightning, poison or thunder deals fire instead. It works like Transmuted Spell, but always applies, costs nothing and can't be turned off. Damage-type choices are always fire, and Fire Shield is always the warm shield (the chill effect was removed from the cast). The curse also grants **Produce Flame**, always prepared. Changes:
- Mind Sliver → **Elementalism**.
- Chain Lightning → **Circle of Ash** (Circle of Death; Joe ruled its damage fire).
- Cone of Cold → **Cone of Cinders** (fire).
- Chromatic Orb, Dragon's Breath, Sorcerous Burst, Fire Shield and Summon Dragon were set to fire in their damage data.
- Joe kept Charm Monster, Greater Invisibility, Hypnotic Pattern, Command and Fear.

She still has 16 prepared spells and 9 cantrips. Every spell the curse touches carries `flags.pentaryn-ties.mark` = a flame icon with a tooltip on the sheet (pentaryn-ties 0.19.0, `item-marks.mjs`). Pre-change snapshot: scratchpad `marrith-before-fire-curse.json` (session-only). The options workflow's full output (fire-spell options per spell level) is in the session transcript, not the repo.

**Summons and forms:** world `dnd5e.allowSummoning` and `allowPolymorphing` turned on. Every summon activity points at a **world** actor in `PC Summons & Forms/<PC> — summons & forms` (unlinked, friendly), except the cantrip/spell conjurations (Mage Hand, Light, Arcane Eye, Minor Illusion, Phantom Steed), which point at `dnd-players-handbook.actors` and are imported on first use (needs ACTOR_CREATE). dnd5e's `placeSummons` requires the summoning user to **own** that world actor. Talo's Wild Shape has 8 direct known forms (Giant Spider, Giant Bat, Giant Badger, Giant Octopus, Brown Bear, Dire Wolf, Spider, Ape). His **Return to Normal Form** feature (bonus action, `flags.pentaryn-transform.revert`) reverts him; tested 2026-10-05. Since pentaryn-transform 0.2/0.3 all of it lives on the Argon Bonus bar: **Wild Shape** (picker of the 8 forms, one click shifts), **Return to Talo** / **Change Form** while shifted, and **Starry Form** (Archer / Chalice / Dragon tiles, one click spends the Wild Shape use, applies `Starry Form: <constellation>` for 10 min and the starlight via pentaryn-senses). Played live as Talo 2026-10-10 — details in `foundry/module/pentaryn-transform/README.md`. 0.3.1 (same day): Escape or any form change cancels Argon's "0/1 Targets" picker, duplicate Use Feature/Use Item panels and the Spellcasting feature are gone from forms, the Reaction slot reads "Opportunity Attack", and the portrait shows Wild Shape temp HP as `99+12 / 99` (they stay after reverting, per the 2024 rule).

**Real player-login test (2026-10-07).** I logged in as each player on `http://127.0.0.1:30000` and kept the GM on `localhost:30000`. Browser cookies are kept per host, so neither session pushed the other out. Results:
- A wrong password was refused.
- Each player sees only their own "Your story" pin and their own personal journal.
- **Add to my journal** worked on the story and on the letter:
  - The player's journal opened with every entry listed and the new one highlighted with a "New" badge.
  - The copy of the letter contained 0 of the 9 sentences from the GM secret.
- Talo's real Wild Shape worked end to end, from the chat card's Transform button to Return to Normal Form. Talo owned the form.
- Summons ended up owned by the player who cast them, through the real activity flow:
  - Caven: Animate Dead (Skeleton, via the profile picker) and Mage Hand.
  - Marrith: Flaming Sphere.
- No player could control another player's character or summons.

Things found during the test:
- **Fixed:** each revert left the form actor ("Talo (Dire Wolf)") in the player's sidebar. pentaryn-transform now has the active GM sweep spent forms.
- **Known limit:** Foundry sends every journal's raw text to every client. A player could read another player's story from the browser console, but never on screen. This is the same limit as GM `secret` sections.
- **Not a module bug:** the test browser's synthetic mouse clicks stopped reaching the tab once a second Foundry window had focus. DOM-dispatched clicks ran the real handlers.

**Player logins (2026-10-07).** Three users, role **TRUSTED**, password = the character's first name in lowercase (Joe's choice: it only guards against picking the wrong character, it is not security).

| User | User id | Character | Colour |
|---|---|---|---|
| Talo | `OiDkYUo0NsT5Mc5X` | Talo | `#3b8fd4` |
| Marrith | `c86KiKsxWAoIRYnO` | Marrith Ashcroft | `#e0702e` |
| Caven | `lilLUo5cIk6JaUda` | Caven Calderon | `#8a63b8` |

Each user is OWNER of their own PC only (other PCs stay `default: NONE`) and OWNER of every actor in their `<PC> — summons & forms` folder; Marrith's placeholder `default: 3` was reset to 0. Core permission **ACTOR_CREATE is now `[TRUSTED, ASSISTANT, GM]`** (was Assistant+GM).

Ownership of shapes and summons, checked in the dnd5e 5.3.3 source and live:
- **Wild Shape / Polymorph** — `transformInto` needs `allowPolymorphing` (on) and ACTOR_CREATE; the new actor copies the **original actor's ownership**, so the player owns the form and its token. Live test: Talo → Giant Badger gave the Talo user OWNER on the form and token, Marrith NONE; the revert item came along; reverting deleted the form and restored the token.
- **Summons** — `placeSummons` needs TOKEN_CREATE and `allowSummoning` (on), and throws unless the user **owns** the source actor. Unlinked tokens inherit the world actor's ownership. Live test: a Skeleton token from Caven's folder gave Caven OWNER and Talo NONE. Compendium conjurations need ACTOR_CREATE: a player import sets `ownership[thatUser] = OWNER` (core `WorldCollection#fromCompendium`), and dnd5e reuses that copy only for a user who owns it, so each player gets their own copy.
- Not yet tested from a real player client. To do that, log in from a separate browser or profile: it would replace the GM session in the same browser.

**Caven's look notes live in Foundry only** (his actor biography), not in the vault. That biography is **player-safe**: it never says he becomes Emperor Quintus. His player is not told, so the GM can see what personality they give him — keep the link out of anything his player can open. (GM side: `world/factions/calderon-imperium/npcs/quintus-calderon.md`.)

**Talo's backstory lives in Foundry only** (his actor biography): his brother's death while learning to fly, the self-imposed sentence underground, and his capture at the drow-watched exits. The drow hold him as a local with lapsed papers, not as an enemy. Lore source: `world/factions/groundstruck/_overview.md`.

## Underdark scenes

**2026-10-17: the candidates are gone.** The three scenes that were played — Drow Prison,
Fighting Pit, Molten Ward — are in Scene folder **`Marrith's Memory`** (`3Vqy7CgyxT2f8pVl`). The 12
unused candidates (Fallen Dungeon of Bron’Darha, Fungal Caverns, Ruined Dwarven Vaults, Tangled
Caverns, Underdark Abyss, Underdark Caverns; Drow City Chasm Edge, Spore Den, Underwood Bazaar,
Tiered Quarter ×3) were deleted with both candidate folders. None had been edited since import on
10-04, and none was linked or referenced. To get one back, re-import it from `pentaryn-seafoot-maps`.
`Surface — Kharg's Adit` was left in `Surface — Candidates`. The record below is history.

Folder `Underdark — Candidates` (7 scenes, off the nav bar), all darkness 1 / global light off / darkness locked, built-in lights stripped except Fungal Caverns' mushroom glow. The Drow Prison is Devils Hold Prison art with The Kings Prison's walls (27 doors, cells included — same 4500x3000 layout).

## Drow City scenes (2026-10-04)

Scene folder `Drow City — Candidates` (`vjk4e5h4RFUaLaaW`), off the nav bar, imported from `pentaryn-seafoot-maps`. All darkness 1, locked, global light off. Built-in lights recoloured violet (`#8a5cff`, dim ≤20 / bright ≤5) as faerie-fire, except the Molten Ward, whose lava glow is kept.

| Scene | id | Source | Use |
|---|---|---|---|
| Molten Ward (streets) | `iBdyqCrrPLU3DHMe` | The Molten City | prison exit onto dense streets and lava canals; 20 crowd tokens |
| Underwood Bazaar (crowded market) | `gH8banUJqgcE3C7N` | Underwood Market | carved-rock market, stalls to blend among; 22 crowd tokens |
| Tiered Quarter (street level / middle floors / rooftops) | `1kwuGAsuAKSaYlJu` / `ketSXjkR65XJtnxI` / `A9FJu5kg6D02dHzP` | City of Vohenheim (3 floors) | vertical chase; 20 crowd tokens on street level. Floors are **not linked** yet (`foundry/scene-links.md`) |
| Chasm Edge (way out) | `ODdE0GOv1QVM9Lrq` | The Ruined City | city edge over the chasm, hand-off to the caves; has no lights |
| Fighting Pit (set-piece) | `gwuR3bitZ3lrpWJZ` | Undercity Arena | public arena showdown |
| Spore Den (hideout) | `bvAVoXeIy6VHtZig` | Undercity Drug Den | place to hide / short rest |

Crowd tokens are the six grey `Drow Commoner (crowd)` actors, unlinked, placed on open floor (checked ≥40 px from move-blocking walls).

**Inmates (2026-10-05):** placed in the cells of `Drow Prison (Devils Hold Prison)` from Joe's markers. Actor folder `Encounters/Drow Prison/Inmates` (`jN4VAW0ZKn2xneAF`), linked, neutral, green ring, GM-note bios. Seven MM Commoners reskinned as the drow's usual captives: Glubbek (kuo-toa), Ursk (orc kitchen thrall), Liriel Amastacia (surface elf), Tomas Brell (human trader), Snik (goblin), Thrund Grimtongue (duergar smuggler), Vorn (disgraced drow male). Plus **Nilonim Vrinn** (Joe dropped "the Rat" 2026-10-05; `MpZinzrOo9y9HZ1H`), a houseless drow informer on the MM **Spy** block (CR 1, 27 HP, poisoned shiv about 12 damage): pleads "I know where your stuff is", then backstabs and runs.

**Scene Props (2026-10-05):** `Hotspot · Look (template)` (`2P3fnZMqdcdcqIy1`) recreated in Actor folder `Scene Props`. It was missing from Pentaryn (it existed only in space-journey). It is an Item Piles container with the eye icon, size 0.5, unlinked, OBSERVER for players, `deleteWhenEmpty: false`. Usage: `foundry/markers.md` *What usually gets placed there*.

**Per-player "how you got here" readables (2026-10-07), Drow Prison:** Markers 1, 2 and 3 are now eye pins, and each one can be seen and opened **only by that PC's player**. Journal folder `Devil's Hold` (`LA41nLWg7UcvRWPl`). The pin label is "Your story". Each entry is `ownership {default: NONE, <user>: OBSERVER}`, with `global: true`. The text covers only why each PC is here (not attributes or appearance), uses nothing beyond what Joe has said, and is short on purpose for Caven. It contains nothing about the empire.

| PC | Journal | Page | Note | x,y |
|---|---|---|---|---|
| Talo | `YT9kVkZAHmEcyUnX` | `RYd4Qeda7m7FtNB2` | `flYJj0k1fhMzX7c2` | 3657,2007 |
| Marrith | `aDmFQunASIiI3Ii6` | `L4m06NlxZneBYUG1` | `ktdECDKoxCTspb39` | 3659,2300 |
| Caven | `jr9nCVYh4cq0DTpS` | `1rQJRoswfNVLwVic` | `oX2IhzewxBUb9anj` | 5335,2295 |

**Caven's entry is now "Caven's Ramblings" (2026-10-07):** both the entry and the page were renamed. The text is his prison journal, about 1,200 words of Joe's draft with the grammar cleaned up and four added entries about his father. Joe now owns that text and edits it in Foundry, so **the journal is canonical and nothing in the vault mirrors it**. It covers his death and the puppet body, and whether he is alive stays open. It says nothing about the empire. The GM-side backstory is in `world/factions/calderon-imperium/npcs/quintus-calderon.md` under "Before the throne".

Visibility was checked against v14 `Note#isVisible`, which tests LIMITED on the page and then the entry: each user passes on their own entry and fails on the other two.

**Guard room and evidence chest (2026-10-05), Drow Prison:** Joe's markers are now built.

| Marker | What it is now |
|---|---|
| 1 ×4 | The off-shift card game: **Zaknil** (`bKUUyzajDij2unlP`) and 3 **House Barrabin Jailers** (`FMd5EEmolHt1cHM9`). Unlinked tokens with a red ring, about 3,200 XP (Low). The Cell Block Turnkeys group, moved to the card table. |
| 2 (north) | `Guard Weapon Rack` (`scuLPDwEOL4c3fjj`): the guards' own weapons — 3 greatswords, 3 heavy crossbows and 60 bolts, longsword, shield, 6 javelins, 2 spears, 2 hand crossbows, 4 daggers. |
| 2 (south) | `Guard Footlocker` (`qQ7pkYRYNfnpzTUJ`): rope ×2, manacles ×2, hooded lantern, crowbar, grappling hook, caltrops, iron spikes, Potion of Healing ×2, Poison (Basic) ×2, healer's kit, candles, signal whistle, playing cards. |
| 3 | **Interrogator Velkyn** (`xL84qQxHEwqa2YqD`, Mage CR 6, Fireball/Cone of Cold/Counterspell): the ambush test. |
| 4 ×2 | Left alone; Joe hasn't decided what goes on the table yet. |
| 5 | `Confiscated Belongings` (`It9izk9GfJ63uiUo`, 0.65 eye): 72 rows of PC gear, each tagged `(Marrith)` / `(Caven)` / `(Talo)`, plus a `Coin Purse (Name)` holding all of that PC's coin. |

All three lootables are `distance: 1` (the player must stand next to them), so the box cannot be looted from across the room past Velkyn. The PCs kept only their clothes, Pearls of Power, Caven's Ring of Spell Storing and his Clockwork Amulet. Everything else went in the box: weapons, staffs, wands, foci, packs, armour, potions, and all three Goggles of Night. That keeps the prison's "no darkvision" design intact.

Attuned items in the box show on the PC's sheet as greyed, broken-chain slots (`pentaryn-attunement` "away" bonds): Marrith (Wand of Fireballs, Cloak of Protection), Caven (Wand of the War Mage), Talo (Staff of the Woodlands, Cloak of Protection). Taking an item out by any route restores its real name. If the item is returning to its owner, it also comes back attuned, equipped and in the same slot, and a coin purse pays out its coin. The deletions are on the dropbin ledger (`game.pentaryn.dropbin.list()`), so the strip can be undone.

**Drow art (2026-10-05):** 36 drow actors across Prison, Streets and the Sunward Gate (Caves) had Monster Manual human art (warrior-veteran, guard, mage, priest…). They now use `assets/tokens/tokens-01/drow-dark-elves/*.png`, with ring subjects made by `ring_subject.py`. Each placed copy of a shared actor gets its own face at the token level: the three card-table jailers are drow-soldier-1/2/3. Still on non-drow art on purpose: inmates, monsters, the duergar Toll-Gang, the Rioting Pit-Fighter allies. **Rule for new drow NPCs:** the Monster Manual 2024 has no drow, so a reskinned MM stat block keeps its numbers but never keeps its MM token.

**Fighting Pit set-piece (2026-10-05), scene `Drow City — Fighting Pit (set-piece)` (`gwuR3bitZ3lrpWJZ`):** this is Velkyn's "gift" to Vaelith. Actor folder `Encounters/Drow Streets/Fighting Pit` (`y9a5rm5Eycka76S7`).

- **The Pit-Hulk** (`AShsRuUeVgsCXvae`): MM Umber Hulk, CR 5. Placed on the summoning hexagon.
- **Chain:** a hidden GM token `Chain (50 ft)` on the stake (actor `UzxkoTr48nIc5nyj`, token `TbZL96531dsSzZor`). A drawn iron chain runs from it to the Pit-Hulk (`pentaryn-senses` chain flag on `p9ahXADff2jWdnhv`); everyone sees it. No movement limit: Joe judges the 50 ft reach. When it breaks free: right-click the Hulk or the stake → **Break chain**. The red reach Region was deleted (2026-10-08). Rend still reaches 5 ft past the line.
- **Edda Brell** (`FVTx9aek1KFIvLmX`, in folder `Inmates`, linked): Commoner. Carries a Shiv (dagger, not proficient) and a Glowstone. Her token light is dim 15 ft / bright 5 ft, blue-green and pulsing, and it is the **only light in the scene**. The scene's 12 lights are *hidden*, not deleted. Her art is `assets/tokens/custom/edda-brell-{art,portrait,token}.webp`. She is Tomas Brell's sister.
- **The box:** Vaelith Barrabin, Second Daughter (`3tpEweUZgZDSu5Wq`, MM Noble, art dark-elf.png; the Lolthite Celebrant was moved off that art), with Lord Ilphrin (existing `AD9f4DLMBKqFA2GC`) and Vaelith's Blade-Maiden (`XhLl01HapHIsS3kS`, MM Knight).
- **The crowd:** 63 ringless crowd tokens, a mix of the 6 `Drow Commoner (crowd)` actors and 10 new `Drow Spectator (<role>)` actors in the drow crowd folder. Roles: off-duty soldier, sellsword, merchant, noble, priestess, half-drow labourer, commoner, scarred veteran, wizard, house guard. The faded art for them is in `generic-underdark/`.

**Houses (attributes, `pentaryn-ties`):** `housebarrabin` and `houseilphrin`, both faction roots. Secret, DC 10 History. whenKnown is `advantage` and whenCarried is `auto`. That pairing is deliberate: `auto` for outsiders made *planStep* grant membership with no roll at all. Members recognise their own House on sight. House lore rows are not rolled by players; the GM hands them over with "Mark as learned", and their DCs are a ruling aid. The GM-only flask button on the token HUD opens the inspect window: *Player view* shows what a PC who passed everything would see, with per-PC who-knows tags and a Share button (see `context/foundry/attributes.md` → Sharing a fact); *Simulate rolls* previews it all with random rolls and writes nothing. The Barrabin sigil is a spider over a closed eye (it matches the seal on Velkyn's letter). The Ilphrin sigil is a silver web strung between two crescent blades.

| House | Linked |
|---|---|
| Barrabin | Vaelith, her Blade-Maiden |
| Ilphrin | Lord Ilphrin Tsabrak, Ilphrin House Knight, Ilphrin Hanger-on |

Lore rows (each is one roll per PC, learned from any identified carrier):

- **Barrabin:**
  - Who they are (History DC 10): the city's gaolers.
  - Who rules (History DC 12): Matron Mother **Sabal Barrabin**. The First Daughter died two years ago; Vaelith is next in line.
  - Known for (History DC 12): spectacle.
  - Weakness (Insight DC 15): overextended, and needs the alliance.
- **Ilphrin:**
  - Who they are (History DC 10): an old House, now wizards and smugglers.
  - Who rules (History DC 12): Matron Mother **Quavra Ilphrin**, who spends her sons as envoys.
  - What they want (Insight DC 15): Barrabin's ruin; the courtship is cover.

**All 23 House Barrabin actors are linked** (2026-10-05): every prison and Streets actor named Barrabin, plus Gate Jailer, Riot-Squad Jailer, Chalithra, Nym and Sister Xull. **Deliberately not linked:** The Outcast of Barrabin (drider) and Kennel-Warden Ilzt, both cursed exiles who hate the House. API: `A.link(actor, "House Barrabin")` resolves by name; a typo is refused, and `A.ensure(title)` returns the existing entry or creates one. Vaelith's and Ilphrin's bios carry the courtship-as-cover story in their GM secret sections.

Story: Velkyn's letter and the guards' betting slate (prison marker 4) are drafted in chat but not built yet. The terms used are the Hour Pillar's dimmings, the Feast of the Hollow Moon, "sunskin", and the Grey Road. They were invented to avoid lifting from the novels. "Sorcere" and "Xorlarrin" (Streets, Sorcere Response Squad) *are* lifts and are pending a rename.

## Encounters (2026-10-04)

Built by a scout/design/build/verify workflow. Nothing placed. Actor folder `Encounters` (`yasBcKGKXTsCSlvH`) holds `Drow Prison` (`yZhu7AdUdUdkCFgk`), `Drow Streets` (`acELVwSI6gRSG1K9`) and `Underdark Caves` (`YjtXFtAmvIiWLSTd`). A creature that fights alone sits at the root of its area folder; a group fight gets its own subfolder. One actor per distinct creature, and `flags.pentaryn.encounter = {name, count, tier, xpEach}` says how many to drop. Rings: boss/elite red, mook grey; hostile, unlinked.

GM-only journals live in Journal folder `Encounters` (`hTv3o8BmDeyIFMA7`): `Encounters — Drow Prison` `Qe4ySkKOOvaflSGP`, `— Drow Streets` `ZOUKcFvvvFZs6vob`, `— Underdark Caves` `Av8ZPV604sNAhpvP`. Each has an overview (recommended four-fight path, cumulative cost, short-rest point) and a page per fight.

- **Budget:** DMG 2024, level 12, party of 3: Low 6,600 / Moderate 11,100 / High 14,100. Prison is all Low (they are gearless). The only High is the Caves exit (Sunward Gate, 12,600).
- **The 2024 MM has no drow stat blocks.** "Drow" actors are official NPC blocks renamed (Guard Captain, Warrior Veteran, Mage, Priest, Assassin, Spy Master, Warrior Commander, etc.). Drow traits (Fey Ancestry, Sunlight Sensitivity, innate Darkness/Faerie Fire, poisoned bolts) are **not on the actors**; the Caves journal carries them as a "drow overlay".
- **House Barrabin** is a placeholder name the designers invented; it is not in the vault.

## Multi-floor places: one Scene subfolder each (2026-10-17)

A building with one scene per floor gets its own Scene subfolder, named after the place, with the
floors inside it (sorted alphabetically, so name them ground → top):
`Erdenford/The Wayward Compass` (`dsdOulWvEDgPLYnr`, 3 scenes) and `travel/Reclaimed Ruins`
(`VkX0jRgA5tvXLqQ2`, 3 scenes). The floors are still linked by `teleportToken` regions.
v14 native Levels (one scene, `changeLevel`) was considered and not chosen: these scenes are
already built (about 1,700 walls, 64 tokens, 150 tiles, 17 regions), and tokens can't be moved
onto a new level, only recreated (`foundry/ops.md` §9). **Use Levels for a new multi-floor build**
when the floors share one footprint.

## Still unbuilt

- Maps/scenes not chosen
- `scripts/foundry/ops/config.py` still defaults the actor pipeline to `space-journey`
- Browser-console module errors not checked (server logs only)
- `pentaryn-lookup` selftest read 9/10 on v14.369: the old getIndex({fields}) canary was
  order-dependent, not a sign the bug was fixed. Replaced 2026-10-10 with a mechanism check
  (core `indexDocument` still drops nested page fields); `getDocuments()` stays

**Scene link: Prison ↔ Fighting Pit (2026-10-05).** A native `teleportToken` pair built from Joe's two `Marker · 1`s, following `foundry/scene-links.md`.

| Scene | Region | Square | Tile |
|---|---|---|---|
| Drow Prison `HrKj6ZgWJGkM9g7j` | `Passage → Fighting Pit` `myybgcoDaGjQg6E0` | 1200,900 (one square in from the map's top-left) | `Una6OFt4UWnRldSJ` |
| Fighting Pit `gwuR3bitZ3lrpWJZ` | `Passage → Drow Prison` `4BNaVkleXHnBBT8w` | 2850,3300 (south stands) | `UvzwfJZXN99Ju9MI` |

Both regions use `choice: true` (a confirm dialog), centre placement and a fade, and are violet on the Regions layer. They are **live, not hidden**. Each end has a `travel-ring` tile at alpha 0.45. A GM must be logged in for a player's crossing to work. Both ends have **portal cards** (`pentaryn-portals`): a map snapshot, a title and a description. The titles are "The Lava Causeway — Devil's Hold" and "The Fighting Pit — the upper stands". Add a second destination by appending its region uuid to the Prison region's behavior `destinations`; the dialog then becomes a pick-one card list.

**Scene link: Prison ↔ Molten Ward (2026-10-08).** This is the second pair, built the same way from a new `Marker · 1` on each map. The markers were then consumed.

| Scene | Region | Square | Tile |
|---|---|---|---|
| Drow Prison `HrKj6ZgWJGkM9g7j` | `Passage → Molten Ward` `xtJm1Mp8BhRZ7nb1` | 1350,900 (the square east of the Pit link) | `9jP26hOujxTJobCX` |
| Molten Ward `iBdyqCrrPLU3DHMe` | `Passage → Drow Prison` `NrQnAYE6sHkDSRvj` | 4500,3600 | `EcRuhkPXLMFjaTtZ` |

The settings match the Pit pair: `choice: true`, centre placement, fade, violet, live, a travel-ring at 0.45, and snapshot portal cards. The cards are titled "The Prison Gate — Devil's Hold" and "The Molten Ward — street level", and their descriptions are placeholders for Joe to rewrite. The Prison has two exits on adjacent squares, and each one has its own region.

**Scene link: Molten Ward ↔ Surface — Kharg's Adit (2026-10-08).** The end of the run: the Molten Ward's north-west lane climbs a forgotten duergar adit to daylight. Built from the ward's round-2 `Marker · 1`, which was then consumed. The new scene `Surface — Kharg's Adit` (`11jLKQiZeC259SnT`, navName "Kharg's Adit") was imported from the `pentaryn-seafoot-maps` entry "Mines Forest", with 359 walls and 16 ambient sounds (river, birds). It is in the new Scene folder `Surface — Candidates` (`LyZV4HtZ6jbfqY2d`) and is off the nav bar, with ownership default 0. Lighting is daylight: darkness 0, global light on, not locked.

| Scene | Region | Square | Tile |
|---|---|---|---|
| Molten Ward `iBdyqCrrPLU3DHMe` | `Passage → Kharg's Adit` `Z1XQ21Iq5VWT1Wjn` | 1500,750 | `dokIMiCXuslq58tv` |
| Surface — Kharg's Adit `11jLKQiZeC259SnT` | `Passage → Molten Ward` `FjIj8rydfOuOJe7q` | 1950,1950 (beside the first mine mouth) | `GYucxQ9qYyg4qmmi` |

The settings match the Prison pair: violet, live, a travel-ring at 0.45, and snapshot portal cards. The cards are "Kharg's Adit — up to daylight" and "The Molten Ward — the north-west lane". The link is live now. To make the run end only when Joe says so, set `hidden: true` on `Z1XQ21Iq5VWT1Wjn` and switch it back on at the table.

**Velkyn's letter (2026-10-06):** an eye readable on the prison desk, where the last Marker · 4 was. Journal `A Letter on Black Paper` (`EirBCPPc51IwEhdC`) in the Journal folder `Devil's Hold` (`LA41nLWg7UcvRWPl`), Observer for players. Note `AxDnMWJl15Qo5Wh7`, labelled "Letter".

The letter is Ilvessa's order, dictated at Vaelith's table, to send Edda to the pit tonight. Velkyn's notes are in the margin. The cruelty is implied, never stated: "Don't bother keeping count of the dimmings", the name check that she arrives unbroken, and her brother "waiting at the far gate". The GM secret section spells out the truth. The betting slate was not built.

**Prison markers 1/2/3/5 (2026-10-06):**

| Marker | What it is now |
|---|---|
| 1 | **Sergeant Vesh, Night Sergeant** (`YuXvBgK9xg4zPEJP`, in the Cell Block Turnkeys folder). A clone of the House Barrabin Jailer (Warrior Veteran, CR 3, 65 HP), so he carries House Barrabin. He has a Signal Whistle and the Cell-Block Key Ring. His personality is the card-table debtor and proud survivor. The fight is about stopping him running: once Bloodied he Dashes for the Warden's Gate gong, whistling, and that brings the alarm wave. Cornered, he trades information. |
| 2 | Two **Patrol Guards** (House Barrabin Guard, CR 1/8), side by side. If one runs, it raises the alarm. |
| 3 | A **Sleeping Guard** (House Barrabin Guard with the Sleeping status). |
| 5 | **Skritch, Kitchen Slave** (`SVdEIDDVdRDFU8f8`, in the Drow Prison folder, linked, green ring). A kobold Commoner using `kobold-with-knife` art. He knows the meal bell, the food lift and the unlocked pantry door. |

The letter's sign-off now reads "Written as she spoke, for Ilvessa, steward to the Second Daughter."

**Front desk (2026-10-06):** **Clerk Nalveth, Registrar of the Lower Cells** (`efAZTVnJUJ1ufSwh`, in the Drow Prison folder, carries House Barrabin, green ring, art `half-drow-with-beard`) is on the prison's last Marker · 1.

- **Who he is:** an aging half-drow clerk. Visitors, prisoners and letters all go through his desk, and he decides what reaches Velkyn.
- **How to get past him:** bribe him (DC 13 with 10+ gp) or show a House seal.
- **In a fight:** a Noble with 9 HP. He hides.
- **Loot:**
  - an **Intake Ledger**, a player-visible page of today's entries: the Second Daughter's order, the PCs' effects in the Keeper's chest, and Edda's transfer tonight;
  - a **Registrar's Seal**, which can be used to forge papers.

**Lootable corpses (2026-10-06):** `foundry/module/pentaryn-dropbin/corpses.mjs`, imported by `dropbin.mjs`. Not a make target: copy both files to `Data/modules/pentaryn-dropbin/` by hand.

- **Trigger:** an NPC token becomes an Item Piles **pile** when its HP reaches 0 or it gets the `dead` status. Only the active GM converts.
- **The pile:** `distance: 1`, it keeps the body's art, `deleteWhenEmpty: false`, and players get OBSERVER on the **token delta only**, never on the base actor. (Since dropbin-EC-3, 2026-10-12: a *linked* NPC's corpse grants OBSERVER on its base actor, given back on revival or when its last corpse token is deleted; see the module README.)
- **The mark:** the body gets the same eye overlay as the loot hotspots (a "Lootable" effect), plus a small Dead icon.
- **Healing back above 0** reverts it and removes the eye. Any HP increase to above 0 on one of our corpses also clears its Dead status. Without that, the "Dead status counts as dead" rule kept a corpse healed to 65 HP lootable (fixed 2026-10-06).
- **Opting out:** `flags.pentaryn-dropbin.noLoot = true` on a token or actor keeps a 0-HP NPC unlootable, for one taken alive.
- **Never converted:** PCs and existing piles.
- **Tested** on a throwaway House Barrabin Guard: Spear, Chain Shirt and Shield were lootable.
- **GM escape hatch:** a corpse's token HUD (right-click) gets two GM-only buttons. **Open character sheet** renders with `bypassItemPiles`, because double-click opens the loot window even for the GM. **Revive (1 HP)** clears Dead, sets HP to 1 and reverts the pile.
- **API:** `game.pentaryn.dropbin.corpses` (`revive(tokenDoc)`).

**Kuo-toa cell (2026-10-06):** an eye readable labelled "Cell", on the prison's Marker · 1 by the Glubbek tokens. Journal `A Crowded Cell` (`8xEbaN9UAUyClRWR`) in the folder `Devil's Hold`. The player text describes the packed cell and only implies the unanswered question of why they're alive. The GM secret: a booking error. They were meant as live feed for the Spider Kennels but were logged by Nalveth as prisoners ("net-menders, one lot"). Ilzt's feed never arrived.

**The drow city is Nathryl Dhaun, "the Pillar City"** (named 2026-10-06; Joe's own, not from the books). The Hour Pillar's dimmings are its clock.

**Origin attributes (2026-10-06).** All are roots, secret, with whenKnown `advantage` and whenCarried `auto`. Each reveal gives a one-line "what this place is". Each has one lore row: *Dealing with them* (Insight DC 12) for the places, and *What happened to it* (Investigation DC 14) for the caravan.

| Attribute | Check | Carried by |
|---|---|---|
| `nathryldhaun` | History DC 10 | Snik, Vorn, Nilonim, and all 28 House Barrabin and Ilphrin actors |
| `merrowgate` | History DC 10 | Tomas, Edda |
| `thegreyroadcaravan` | Insight DC 12 | Tomas, Edda, Thrund |
| `garhammartradeleague` | History DC 10 | Thrund |
| `araethilion` | History DC 10 | Liriel |
| `garrokconfederation` | History DC 10 | Ursk |

The Grey Road Caravan is deliberately a **root**, not a child of Merrowgate: a child link would have written Merrowgate onto Thrund. **Decided 2026-10-06:** the caravan was **sold, not ambushed**. Its Merrowgate backer owed House Barrabin, and the caravan, people included, was the settlement. Thrund brokered the handover knowingly. The trade route is untouched, because legally nothing broke. The lore row *Is anyone coming for them?* (Insight DC 14) reveals the truth on a success. On a failure the player is handed Tomas's ransom story, the row's `miss` (since 2026-10-08 written failure text is shown to the player; empty shows nothing — [`plans/attribute-silent-failure.md`](plans/attribute-silent-failure.md)). Tomas's GM notes say the truth gives advantage on persuading him to escape; Thrund's GM notes have his deflection ("Merrowgate sold them, not me"). Still open: whether Vorn carries House Barrabin, and Liriel's name (likely from the books).

**Personal attributes (2026-10-06).** Category `personal`, titled "{Character} History": one character's own past, never reused, and shown under the review panel's **Personal** filter. **Global**, the default, shows everything else. The first one is `nilonimvrinnshistory`: History DC 25, whenKnown `enables`. **He is the last of House Vrinn, which he sold to House Barrabin.** "To vrinn" is street-cant for betraying your blood. Knowing it gives a PC leverage: he stops lying to them, and Persuasion and Intimidation have advantage. The history is layered:

- **Three DC 20 facts on Nilonim himself**, which players roll from their Known tab:
  - "The name Vrinn" (History): Vrinn was a House.
  - "What became of House Vrinn" (History): Barrabin ended it in one night.
  - "How the street says his name" (Insight): "to vrinn" means selling out your blood.
- **The full truth, that he did it,** is the DC 25 personal attribute, rolled on Inspect.

Each piece is true on its own; together they point at him. The attribute's failure text is a half-truth: Vrinn as "safe bets" (delivered on a failed identification since 2026-10-08, filed on the creature's page, never under the attribute's name).

**Sheet change:** every attribute row on an actor sheet now shows its identification check (skill, DC, the text on a success, and the text on a failure, which the player is shown — empty means nothing), and it can be edited there.


**Confiscated gear split per character (2026-10-06).** The single `Confiscated Belongings` box (`It9izk9GfJ63uiUo`) was replaced by three eye piles side by side at its spot: **Marrith's Items** (`3GX5HDp1j3LENy3B`, 25 items), **Caven's Items** (`O2azYqKUtqqXIeRA`, 19 items) and **Talo's Items** (`AdDFSTn2tDgnLkNK`, 28 items).

- **Sorting:** items were split by their attunement bond owner. Cached spells went with their parent item, keeping their ids.
- **Hover:** the name shows to everyone (`displayName` HOVER).
- **Pile settings** are cloned from the old box (`distance: 1`, `deleteWhenEmpty: false`). The attunement bonds and the "(Name)" tags still work.

**House Vrinn chain (2026-10-06).** `housevrinn` is a Global fallen House: History DC 18, whenKnown `advantage`. It is the parent of both personal histories:

- `nilonimvrinnshistory`, re-parented here. He sold the House out.
- `veshshistory` (DC 25). Vesh is the last of **the Still Hand**, Vrinn's honour guard. His left arm is held stiff with a bolt palmed at the hip, and he hides under a dead Barrabin soldier's name.

Vesh has conceal `{housevrinn: 4}`, so his House Vrinn check is DC 22. Neither man knows the other's secret: Vesh doesn't know Nilonim sold Vrinn, and Nilonim doesn't know Vesh survived.

Vesh's surface facts, all player-rolled, none chained:

- card table, Perception 12;
- eyes on the exits, Insight 15;
- the whistle tell, Insight 18;
- wrong kit, Investigation 20.

Preview confirmed the chain: House Vrinn failing at DC 22 blocks Vesh's History.

**Vesh chain eased (2026-10-06, Joe: "75% that Caven knows"):** House Vrinn is now DC 12 (was 18), Vesh's conceal is removed (was +4), and Vesh's History is DC 13 (was 25). Odds for the whole chain: Caven 77%, Talo 18%, Marrith 14%, about 83% for the party. Nilonim's History stays DC 25, but its House Vrinn step is now also DC 12.


## PC attributes (2026-10-06)

The three PCs' origins as attributes, so each player learns who they are from their own sheet and
can inspect the others. All ten entries are new, `secret: true`, `hold: false`, `whenCarried: "auto"`,
**unreviewed** (Joe's panel), no `source`. Rules applied: [`foundry/attributes.md`](foundry/attributes.md)
("Attribute or fact?" and "Building a player character's attributes").

**GM only, never in Foundry:** Caven later becomes Emperor Quintus. Nothing in the registry, flags
or grants hints at it; "Calderon" is just his surname. The invented reason for Marrith's debt:
he worked out she was a witch, above, and kept it for years.

| id | parent | check | help | carriers | facts |
|---|---|---|---|---|---|
| `witchesofelderholt` | — | his 20 | advantage | Marrith | 8 |
| `wardwitches` | witchesofelderholt | arc 15 | advantage | Marrith | 5 |
| `marrithshistory` | witchesofelderholt | ins 18 | enables | Marrith | 6 |
| `lonepeak` | — | his 10 | advantage | Talo | 5 |
| `thegroundstruck` | lonepeak | his 20 | advantage | Talo | 9 |
| `taloshistory` | thegroundstruck | ins 15 | enables | Talo | 8 |
| `stardruids` | — | nat 18 | advantage | Talo | 5 |
| `brenfen` (new city-state) | — | his 10 | advantage | Caven | 4 |
| `fenwardensofbrenfen` | brenfen | his 12 | advantage | Caven | 3 |
| `cavenshistory` | fenwardensofbrenfen | ins 15 | enables | Caven | 6 |

Brenfen is a fen causeway town east of the great lake, one of a dozen rival city-states in 3200.
Vault stub: `world/factions/ardenhaven/locations/brenfen.md`. Nathryl Dhaun is **told** to all
three (`A.tell`), not linked.

**Tells** (each PC's own `flags.pentaryn-ties.lore`, player-rolled, no tree above them):

- Marrith: The red skin (prc 10), The fire and the cloth (prc 12), Not afraid (ins 14).
- Caven: Starved (med 10), The veins (arc 12), Still thinking (ins 13).
- Talo: Star-flecks (prc 10), A local (ins 12), The feather (prc 12), The squint (prc 14).

**Self-knowledge** (direct `granted` writes, `attr:<attrId>:<loreId>`):

- Marrith, 19: all Witches, Ward-Witches and History rows.
- Caven, 13: all Brenfen, Fen Wardens and History rows ("Who he is" first).
- Talo, 13: Groundstruck "Two sayings", "Grounded", "The crime", "Naming your star", "The worst
  thing you can say", "The sentence", "The new star"; all 5 Star Druids; History "Who he is".
  His bio already covers the rest; his Lone Peak and other History rows are there to hand to others.

**Story-given cross-knowledge** (`S.share`, `notify: false`):

- Caven about Marrith: identified `witchesofelderholt` and `marrithshistory`. Facts: Leave the
  witches alone, Two paths, Witches walk, The capture, Who she came for. Ward-Witches is
  **not** shared: he rolls it (arc 15 at advantage, 95%).
- Marrith about Caven: identified `brenfen`, `fenwardensofbrenfen`, `cavenshistory`. Facts:
  Who he is, The drow libraries, The witch.
- Talo: a stranger to both.

**Inspection odds** (flat d20; a failed rung stops that ladder for this inspect; "told" = shared):

| inspector → subject | rungs | tells |
|---|---|---|
| Marrith → Caven | all three told | Starved 75%, Veins 60%, Still thinking 60% |
| Marrith → Talo | Lone Peak 50%, Groundstruck 0%, History unreachable, Star Druids 10% | Flecks 55%, Local 65%, Feather 45%, Squint 35% |
| Caven → Marrith | Witches told, Ward-Witches 95%, History told | Red skin 80%, Fire 70%, Not afraid 40% |
| Caven → Talo | Lone Peak 100%, Groundstruck 50%, History 17.5% chained, Star Druids 40% | Flecks 80%, Local 50%, Feather 70%, Squint 60% |
| Talo → Marrith | Witches 5%, Ward-Witches 2.75% chained, History 2% chained | Red skin 100%, Fire 90%, Not afraid 60% |
| Talo → Caven | Brenfen 55%, Wardens 25% chained, History 14% chained | Starved 80%, Veins 70%, Still thinking 65% |

**Handout line for players:** "An inspect climbs until the first thing you miss, and that miss is final for you. Passed steps and tells are one roll each, ever. Tells (what you can see on someone) are rolled separately from inspecting."

**Open question for Joe:** Ward-Witches "The eyes come last" says young ward-witches keep their
own eyes (to match Marrith's bio). If a ward-witch's eyes are always violet, drop that row and
change her bio.

## Molten Ward round 2, group 2: the Witness-chapel (built 2026-10-08)

Four surface oath-clerics in the hall in the ward's south-west corner. Design: `plans/molten-ward-cast.md`, Round 2 group 2. Actor folder `R2-2 · The Witness-chapel` (`lugndOjvBLZHSc4O`) under `Encounters/Molten Ward`. New attribute `thehoodedwitnesses` (parent `merrowgate`, DC 12 Religion, 3 facts). Every token is 1×1, scale 1, linked, Neutral, green ring, sight on. Altar candle light `4HUJ7pJ7OwgQownI` at (1500, 2760), dim 10 / bright 5.

| Token | Actor | Who | Block |
|---|---|---|---|
| `XAHHMNjgpjZJX3Ij` | Prior Edrow `sl931jy0Z9RkFe3A` | human Prior; has *Zone of Truth* 1/day | Priest, CR 2 |
| `IxDMdzaqUE4A9DKY` | Sister Thornmere `fsCGGQtmrrKNJyQa` | human, the chapel's hand | Priest Acolyte, CR 1/4 |
| `XA445CxlbMGvl6d7` | Brother Drogmok-dur `tqC3DSFRZFH0X7SQ` | dwarf doorkeeper, darkvision 120 | Priest Acolyte, CR 1/4 |
| `SP8sm6fowcBjHkfh` | Novice Bramblepin `OgVs1SgI5MzaKi6B` | halfling novice | Priest Acolyte, CR 1/4 |

## Table-feedback install (2026-10-09)

Plan: `plans/table-feedback-2026-10-08.md` (see its Built section). Backup `world-2026-10-09-185930-fvtt14.367.tar.gz` (replaced the 2026-10-07 snapshot).

- **Modules added:** `pentaryn-cursors`, `-movement`, `-creatures`, `-riders` (all 0.1.0). Updated: aoe 0.2.0 (publish deferred a tick so the importer does not wipe `game.pentaryn.aoe`), dropbin 0.2.0, portals 0.4.0, senses 0.3.0. `pentaryn-walls` stays off.
- **Data changes:** Healer Battle Medic on kit `uQl75i2elRxbACK5`; Caven's Ring `QfLFgZdMTLVjy4ei` cast activities `k3B8CnK3Tf6stgMx`, `9r5QQhy1QMf2nO5I`; Arcane Ward `LBwPXkJyx83Aj3lv` all special; `core.prototypeTokenOverrides` displayName 50 (177 actors; re-apply with `diff:false`); story pins moved (`flYJj0k1fhMzX7c2`, `ktdECDKoxCTspb39`, `oX2IhzewxBUb9anj`) and a "Your story" page per personal journal; Marrith's cantrips prepared; Oil/Torch stacks merged; Marrith's Elemental Adept = fire.
- **Journal:** "Where is my X — player tips" `tmVh6WdF5E8OB6wT`, players OBSERVER.
- **Known:** Argon "always on" setting is off (HUD only in combat).


## Talo's Wild Shape on the HUD (2026-10-09/10)

Plan/record: `plans/druid-wild-shape.md`. Use-doc: `foundry/module/pentaryn-transform/README.md`. Module `pentaryn-transform` 0.2.0 installed 2026-10-09, now at **0.3.3** (adds `hud.mjs` and `styles/transform.css`; since wave 4 Starry Form is a feature that `hud.mjs` no longer imports). Backup `world-2026-10-09-232812-fvtt14.367.tar.gz` (taken with `make foundry-backup REASON=pre-transform-0.2`; replaced `world-2026-10-09-185930-fvtt14.367.tar.gz`).

- **What changed for Talo:** Wild Shape (item `CVPK5NrDGJ841krP`, 3 uses) and Starry Form now live on the Argon Bonus bar: one click on a form tile shifts, **Return to Talo** / **Change Form** while shifted, one chat line per shift. Auto-revert at 0 HP, Incapacitated, 6 hours, and on a Long Rest. His data needed no edits; the 0.1 revert item `i9A691XB3y95S2ei` (flag `flags.pentaryn-transform.revert`) is kept and copied onto each form.
- **2024 rules used:** uses by druid level, one back on a Short Rest, all on a Long Rest, Bonus Action to shift and to revert, duration 6 hours (PHB).
- **Playtest 2026-10-10 (real clicks as Talo): core flow PASS, overall FAIL on audit items.** Still open:
  1. Talo's **Revivify** (item `Xb828Bgvlh2mfnVA`, activity `dnd5eactivity000`) is still a `damage` activity with formula `1`; should be `heal`.
  2. **Cosmic Omen** is only Argon's plain button (badge 5); no d6 omen shown, Weal (Even) / Woe (Odd) not surfaced on the HUD.
  3. Argon's target picker gives no cue until the mouse moves; a click slightly off the token silently stays 0/1 (Argon behaviour).
  4. Small: the form panel opens at the far left of the Action bar, the rest chat line for a shifted druid reads "Talo (Giant Bat) takes a short rest.", the Archer tooltip lingers after a click, the sheet route was exercised only via `Item.use()`.
- **Strays:** polymorph form "Caven Calderon (Allosaurus)" (`zRTdAW9xtjnoMYzr`) has a token on "Surface — Kharg's Adit" and no Wild Shape/revert item. Potent Spellcasting skipped. Players on 0.2 get it when they reconnect.
- **Cleanup after test:** test chat deleted, no form actors/combats, Wild Shape spent 0, Argon Always On off, Drow Prison active and paused.

## dnd5e 6.0.6 upgrade (2026-10-10)

The pentaryn world now runs **dnd5e 6.0.6** (was 5.3.3) on Foundry 14.369; migrated cleanly (226 actors, 449 chat messages, 16 scenes) and all three PCs plus Caven's Allosaurus form open without errors. Kept after a live Argon playtest (Marrith, Caven, Talo; real HUD clicks, GM and player tab): no rollback trigger fired, even though `enhancedcombathud-dnd5e` 5.2.2 and `itempilesdnd5e` 1.1.0 do not declare 6 support. All `pentaryn-*` modules were ported and synced. Build record, retired-for-native list and accepted degradations: `plans/dnd5e-6-upgrade.md`. Rollback recipe lives there too (backups in OneDrive `pre-dnd5e6-2026-10/`).

- **Open:** other three worlds unlaunched on 6 (they migrate on first launch); cards-flow suite not run; Caven "Allosaurus" token (`3MOg1yNcRGsrJtBj`) has an empty texture (pre-upgrade Wild Shape, art in `previousTokenData`); stale expired "Imperceptible Barrier" effect on Caven; keep **one** GM client connected (several GM tabs duplicate Item Piles takes).
- Updater stays paused.
- **2026-10-10 update:** other three worlds now migrated to dnd5e 6.0.6 (no longer open). Test cleanup done: chat 446 messages, Caven's stale Imperceptible Barrier removed (AC 15), no combats, Drow Prison active and paused. Item Piles default pile is now `RReAnOkxHGoZ1Ca7`. Still open: Allosaurus token texture, cards-flow suite.

## Prompt markers (2026-10-10)

Module `pentaryn-prompts` **0.4.0** installed and enabled (lookup 0.3.0 beside it); six marker actors in the **`Prompt Markers`** actor folder (not `Temp Markers`); a hidden `Prompt · <size>` token carries Joe's typed text and one MCP call, `prompt-markers` (`gather`, then `replace`), turns each into a real actor/PC/hotspot/note/light/tile. Polished 2026-10-10 (plan §15): docs corrected, eval scratch removed, known gaps listed in the playbook. Backup `world-2026-10-10-100635-fvtt14.369.tar.gz` (`REASON=prompt-markers`). Playbook: `foundry/prompt-markers.md`; build record: `plans/prompt-markers.md`; module: `foundry/module/pentaryn-prompts/README.md`.

- UX playtest passed; LLM evals 8/8/7 (round 2) and 8/9/7 (round 3); both rounds' follow-ups shipped in 0.3.0 and 0.4.0 (plan §13–§14).
- New sessions need a Claude Code restart (or `/mcp` reconnect) to see `mcp__foundry__prompt-markers`.

## Usability re-run, Area 9 prompt markers (2026-10-11)

Drag, P, Shift+P, size chip, gather, dry run, replace and the `character` build all passed; players
see no marker (canvas, sidebar). Nothing in the world was left behind (ZZ Arena, actors, user and
journals deleted; Drow Prison active and paused). Details: `context/plans/usability-changes-2026-10.md`
section "Area 9 re-run".
