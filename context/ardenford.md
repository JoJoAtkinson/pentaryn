---
title: "Ardenford — campaign state"
status: active
last_modified: 2026-10-15
tags: [context, campaign, ardenford, ardenhaven, campaign-state]
---

# Ardenford — campaign state

**Read this when:** building or running the Ardenford campaign in Foundry — what exists in
the world, what is still a suggestion, what is still unbuilt.
**Not this file:** how Foundry works → [`foundry/README.md`](foundry/README.md) ·
the city's lore, districts, shops and NPCs → `world/factions/ardenhaven/locations/ardenford/`
· the *other* campaign → [`space-journey.md`](space-journey.md)

> **This is a volatile file.** Dated findings and IDs belong here, not in the Foundry
> domain root.

Foundry world id **`ardenford`**, title **Ardenford**, dnd5e 6.0.6 on core 14.369 (migrated 2026-10-10).
Seated in [Ardenford](../world/factions/ardenhaven/locations/ardenford/ardenford.md), the
three-tiered capital of Ardenhaven — Lower Tier harbour, Middle Tier trade and
residential, Upper Tier ridge, and an ancient tunnel network under all of it.

---

## 2026-09-17 — world created

Built from `space-journey`'s setup, not from scratch. Method and the traps are written up
in [`foundry/ops.md`](foundry/ops.md) → *Creating a new world*; what landed here:

- **All 30 modules** `space-journey` had are enabled, by copying `core.moduleConfiguration`
  into the world's `settings` LevelDB before the first real launch. Verified live: 30 active,
  zero drift in either direction.
- **`core.permissions`** and **`core.prototypeTokenOverrides`** copied too — so the
  world-wide `lockRotation: true` convention holds here from day one.
- **`core.compendiumConfiguration` deliberately not copied** (Folder ids don't travel).
  dnd5e rebuilt the same sidebar folders by itself. The one thing re-applied by hand:
  `pentaryn-seafoot-maps.scenes` unlocked, matching `space-journey`.
- No actors, no journals beyond the suggestion list, no playable scene chosen yet.

## The `Suggestions` folders — 115 candidate maps, none of them decisions

The Scenes sidebar has a **`Suggestions`** folder with seven sub-folders, and the Journal
sidebar has a matching **`Suggestions` → `Ardenford — Map Candidates`** entry that maps
each city location to its candidates and says why each one was picked.

| Sub-folder | Scenes |
|---|---:|
| 1 · Lower Tier — Harbor | 13 |
| 2 · Middle Tier — Trade & Residential | 12 |
| 3 · Upper Tier — Ridge | 12 |
| 4 · The Keeps | 22 |
| 5 · The Ancient Tunnels | 18 |
| 6 · Interiors — Inns, Shops & Halls | 20 |
| 7 · Outside the City | 18 |

**Selection rule: walls already drawn.** Every one of the 115 has authored walls (the
thinnest is 11, the heaviest 2,168); most carry lighting and ambient sound as well. That
rule is why the OneDrive battlemap folders and the 1,217 unnamed `Castle Maps - NNN`
JPEGs were left out entirely — raw images with no wall data. Sources used, all already
enabled: `pentaryn-seafoot-maps` (687 scenes), `eledryll-maps-castle-life-bundle-1`,
`eledryll-spiders-tear-opera-house`, `mad-endlesswiz`, `mad-endlesswiz2`,
`dnd-dungeon-masters-guide`.

Imported with `active: false, navigation: false`, so nothing is in the scene nav bar and
nothing is the active scene. **These are meant to be culled** — deleting a scene is one
click and removes its walls with it.

### The one weak match

**Greystone Granaries** (folder 4) — five interconnected warehouses built around an
ancient tower, siege- and fire-proof. Nothing in the library is that. `The Old Mill` and
`Cliffton Castle` are standing in. If the Granaries matter to a session, they want
building rather than picking.

### The find worth knowing about

`City of Saltspray`, `City of Turmburg` and `City of Vohenheim` each ship as a
**three-level stacked coastal city** — ground / Middle Floors / Top Floors — which is
Ardenford's own geometry. Taking all three levels of one of them gives a continuous city
across the tiers rather than three unrelated maps. They are split across sub-folders 1, 2
and 3 on purpose, so the tier each one serves is obvious.

---

## 2026-09-17 — the three players

| User | Role | Password | Colour | Avatar |
|---|---|---|---|---|
| Jack | Trusted Player (2) | none | `#28cc71` | `assets/tokens/custom/jack-token.webp` |
| Sean | Trusted Player (2) | none | `#287bcc` | `assets/tokens/custom/sean-token.webp` |
| Zac | Trusted Player (2) | none | `#8a6fd4` | `assets/tokens/custom/zac-token.webp` |

**Trusted Player, not Player** — matching `space-journey`'s Kristine/Kyle/Joe, because the
`core.permissions` copied from that world is tuned around role 2. Drop to role 1 and some
of those grants stop applying.

Art came from the three tokens Joe had selected in the **Roll20** `Ardenhaven` campaign,
pulled from `files.d20.io`. Ring subjects built to the standard ⅔ safe area with
`scripts/foundry/ring_subject.py`:

    assets/tokens/custom/ring-subjects/jack-token-025881.webp
    assets/tokens/custom/ring-subjects/sean-token-af5f34.webp
    assets/tokens/custom/ring-subjects/zac-token-0e4a53.webp

🔴 **The source art is only 144×144.** Roll20's CDN stores exactly one size for these —
`original`, `max`, `med` and `thumb` all return the same 8 KB webp, and the `.png` variants
404. Scaled into the 341 px safe area that is a 2.4× upscale, so it is soft when zoomed in.
If better originals exist, re-run `ring_subject.py` on them and the filenames change (the
hex suffix is a digest of the source).

No actors yet — the users have `character: null`, and the Roll20 tokens they came from
represent no character sheet either.

## 2026-09-17 — The Wayward Compass, and the cast

**The inn is built.** Space Journey's tavern came across whole, as a scene folder
`The Wayward Compass`:

| Scene | Walls | Lights | Sounds | Tokens |
|---|---:|---:|---:|---:|
| 1. The Wayward Compass — Common Room | 272 | 21 | 25 | 40 |
| 2. The Wayward Compass — Guest Rooms | 221 | 17 | 18 | 25 |
| 3. The Wayward Compass — Roof | 114 | 6 | 3 | 0 |

Copied straight out of `space-journey`'s LevelDB and created with `keepId: true`, so the
three **`teleportToken` Regions still wire the floors together** — Taproom ↔ Second Floor ↔
Roof. All destinations verified resolving. Keeping the ids is the whole reason that works;
a re-import without them silently produces three unconnected maps.

🔴 **Method, for next time.** The embedded collections live in sublevels keyed
`!scenes.<coll>!<sceneId>.<docId>`, nested two deep for `scenes.regions.behaviors` and
`scenes.tokens.delta.items`. The scene document itself stores only **arrays of ids**, so a
copy has to re-inflate them. Extract with both worlds closed, validate every id resolves
before writing, then stage the JSON into the target world dir and `fetch()` it from the
client. **Take the tunnel down while the staged file exists** — everything under `Data/` is
publicly served — then delete it and prove the 404.

### The cast — 46 actors in three folders

- **`The Wayward Compass` (18)** — Space Journey's tavern crowd, imported with the scenes:
  43 `Doorbreaker Mercenary` tokens plus named patrons (Quill, Edmun Latch, Skipper Rojan,
  Brother Aldous, Vess Tarrow, Isbet Marrow "Lark", Old Cobb, Ansa Pike…).
  ⚠ **`Ballad Quinn` and `Pip Locksley` are Space Journey's PCs** and came with the set.
  ⚠ `Harl Wetherby` is SJ's innkeeper — his actor is kept but **his tokens were removed**
  and Thorgrim put on his square.
- **`Ardenford — Townsfolk` (15)** — every named Ardenford character in the vault, stubbed:
  name, art, ring tier, biography from the lore file. **No stat blocks** except Thorgrim.
- **`Ardenford — Extras (crowd)` (10)** — the faded `generic-villagers` art as ringless
  crowd actors, to drop onto street scenes and rename if they turn out to matter.

**Thorgrim Ledger-Scar** is the innkeeper, from
[`world/factions/ardenhaven/npcs/thorgrim-ledger-scar.md`](../world/factions/ardenhaven/npcs/thorgrim-ledger-scar.md)
— Mountain Dwarf, CR 2, 68 HP, AC 15, full biography. His mechanical features (Shield Slam,
Tavern Brawler, Dwarven Resilience, Tower Shield Defense) are **described but not yet added
as items**.

🔴 **Three vault documents disagree about who owns The Wayward Compass:**
`ardenford.md` says Torren Ashvale, a retired human soldier; `shops/wayward-compass.md` says
it is a *courier service* run by Barnaby; `npcs/thorgrim-ledger-scar.md` says Thorgrim owns
and keeps it — and even hedges, "Torren Ashvale (if Torren exists in your version)". Thorgrim
is the one in play. **All three are stubbed as actors; the vault still needs reconciling.**

Four token art paths (`Ode Kellam`, `Simm Rowl`, `Quill`, `Vess Tarrow`) arrived pointing at
`tokens-01/humans-male/…` instead of `tokens-01/humans/humans-male/…`. Repaired here on both
the actors and the 6 placed tokens; **they are still broken in `space-journey`.**

## 2026-09-17 — The Hideout, and the marker set

**`Temp Markers` actor folder recreated** — `Marker · 1`…`12` and the eight colours, rebuilt
from Space Journey's definitions rather than copied (the art in
`assets/tokens/custom/markers/` lives under `Data/` and is already shared by every world, so
only the actors had to be made). Same contract as
[`foundry/markers.md`](foundry/markers.md): 0.25 grid units, ringless, `displayName: 50`,
disposition 0.

⚠ **One deliberate divergence.** `markers.md` says the markers are "prototype-hidden", but in
`space-journey` no `hidden` flag is set on the prototype at all — the doc describes intent the
data never had. Ardenford's copies set `hidden: true` on the prototype **and** on each placed
token, because `getTokenDocument()` does not carry prototype `hidden` through to placement.

**The party hideout** is `The Hideout — Underwood Market`, promoted out of
`Suggestions → 2 · Middle Tier` into its own `The Hideout` scene folder and added to the scene
navigation bar as **Hideout**. A covered/underground stone market: stalls under striped
awnings, a central rotunda, crate yards, a stair up in the north-east, and a bar counter with
tables in the south-east room. 307 walls, 30 lights, 15 ambient sounds, all authored.

Markers 1–9 are placed and hidden, one per distinct area, so a spot can be named in chat:

| # | Where | Image px | Canvas px |
|---|---|---|---|
| 1 | north-west stalls, green and red awnings | 1125, 338 | 2306, 1069 |
| 2 | west pillared corridor — the lit approach | 712, 1500 | 1893, 2231 |
| 3 | walled side room, north-west quarter | 1462, 1125 | 2643, 1856 |
| 4 | the central rotunda | 2081, 1500 | 3262, 2231 |
| 5 | open crate yard, north of centre | 2737, 938 | 3918, 1669 |
| 6 | north-east storeroom and the stair up | 3487, 488 | 4668, 1219 |
| 7 | the four-stall block, east hall | 3431, 1481 | 4612, 2212 |
| 8 | south-east room — bar counter and tables | 3750, 2400 | 4931, 3131 |
| 9 | south-west stalls | 1387, 2588 | 2568, 3319 |

Scene is 4500×3000 at grid 150 (30×20 squares), padding 0.25 → **canvas = image + (1200, 750)**.
Getting that offset wrong is the mistake `markers.md` warns about.

## 2026-09-17 — the bandits at marker 2

Marker 2 (the west pillared corridor, the lit approach into the Hideout) is now a bandit
gang, and the marker was **consumed** per the placement contract in
[`foundry/markers.md`](foundry/markers.md). Joe had already deleted markers 1 and 3–9.

| Token | Stat block | CR | XP | Ring |
|---|---|---:|---:|---|
| Bandit ×4 | `dnd-monster-manual.actors` → Bandit | 1/8 | 25 ea | grey `#9098a0` — mook |
| Sevrin Thornwick | `dnd-monster-manual.actors` → Bandit Captain | 2 | 450 | **red `#d8433a` — foe** |

The two ring tiers are the whole point: the captain reads as the dangerous one at a glance
without a nameplate or a stat check. Both drawn from the **owned 2024 Monster Manual**, not
the SRD, per [`foundry/rules-lookup.md`](foundry/rules-lookup.md).

**Budgeted for three level-2 PCs.** 550 XP total against the 2024 DMG's Low 300 / Moderate
450 / High 600 for that party — a real fight, short of deadly. 2024 dropped the encounter
multiplier, so the raw sum is the comparison. Worth knowing: **the captain alone is 450 XP**,
the entire Moderate budget, and the gang outnumbers the party 5 to 3.

The owned MM bandit ladder is **Bandit 1/8 → Bandit Captain 2 → Bandit Deceiver 7 → Bandit
Crime Lord 11**. There is no CR 1 bandit; Deceiver is CR 7, not the mid-tier its name suggests.

**No firearms.** The 2024 MM Bandit Captain ships with a **Pistol** (martial ranged, 1d10
piercing, 30/90, Vex). Swapped for a **Hand Crossbow** — 1d6 piercing, 30/120, ammunition /
light / loading, Vex — from `dnd5e.equipment24`, with `_stats.compendiumSource` stamped.
A world sweep confirms it was the only firearm in Ardenford.

🔴 **Convert the item in place; do not delete it.** The captain's Multiattack reads
`[[/item .2TB9ZSIbtbi4UtSv]]`, an item-id reference. Deleting the Pistol leaves a dead link in
the stat block. Re-skinning the *same item id* keeps the link intact and the enricher picks up
the new name by itself — Multiattack now renders "using Scimitar and Hand Crossbow in any
combination" with no edit to the feat.

Hand crossbow is the right swap because it is **one-handed**: Multiattack lets him mix it with
the Scimitar, which a two-handed heavy crossbow or longbow would break. Cost is 1d10 → 1d6, so
his ranged attack drops from avg 8.5 to 6.5. CR and the 550 XP budget are unchanged.

One Bandit actor carries all four mook tokens (`actorLink: false`), so damage is tracked per
token. `Sevrin Thornwick` is an invented name in the Ardenhaven human pattern — rename freely.

⚠ **`prototypeToken.name` does not follow an actor rename.** Creating the captain from the
compendium under a new name left every placed token nameplated "Bandit Captain"; the prototype
and the placed tokens both had to be set explicitly.

## 2026-09-17 — the misfit spots

**The party is three level-2 misfits** — chaotic neutral leaning evil-ish, "evil with hearts":
not heroes, definitely not villains, decent when it is cheap enough. Four town spots built for
that, promoted out of `Suggestions` into `Ardenford — Misfit Spots` and put on the scene nav bar:

| Nav name | Scene | Walls / Lights |
|---|---|---|
| Western Market, after dark | Summer Marketplace Night | 168 / 14 |
| The Vintara Baths | Clandestine Bath House | 188 / 23 |
| The Drowned Tap | Undercity Sewer Tavern | 592 / 17 |
| The Concordance Library | Arken's Ancient Library | 456 / 0 |

Situations live in the journal `Ardenford — Misfit Spots`, one page each. Every page follows the
same shape: why they end up there · three dumb ideas they *will* have · what actually goes wrong ·
who is standing there · if it goes loud (XP-costed) · **the heart**.

**"The heart" is the load-bearing part of the brief.** Each spot has one beat where being decent
costs them something small and real — the porter with his daughter's name on the tally board, the
bath attendant who gets blamed, the smuggled Willowglass medicine that quietly stops reaching the
Gray District. Consequence by things-getting-worse-offscreen, not by punishment. Drop those and
the party is just petty criminals.

They reuse the existing cast rather than inventing more: **Elarion Faenwynd** and **Magister Ellyn
Merrick** at the Concordance, **Khargrom-dur** vouching for them in the tunnels, **Pell Orvaine**
as the soft way in.

### Encounter budgets — three level-2 PCs

Low 300 · Moderate 450 · High 600 (2024 DMG, no multiplier). Verified XP from the owned MM:

> Commoner 10 · Guard / Bandit / Cultist / Warrior Infantry / Noble 25 · Swarm of Rats / Goblin
> Warrior / Priest Acolyte 50 · Scout / Tough 100 · Spy / Pirate 200 · Bandit Captain / Berserker /
> Cultist Fanatic 450 · Guard Captain 1,100

**Guards are AC 16** — at level 2 the watch is a reason to run, not a speed bump. **Guard Captain
at 1,100 XP is nearly 2× the High budget**: a losing condition, not an encounter. There is no
`Thug` and no `Acolyte` in the 2024 MM — use `Tough` (CR 1/2) and `Priest Acolyte` (CR 1/4).

🔴 **Every Seafoot scene ships `globalLight` on at darkness 0.** "Summer Marketplace *Night*" is
night in the *art only* — mechanically it is broad daylight, and the 14 placed lights do nothing.
Raise the scene darkness level if stealth is supposed to matter. This applies to all 115 imported
candidates, not just these four.

## 2026-09-17 — the four boards are dressed

28 tokens across the four misfit spots, **6–8 each** — deliberately few enough to track without a
sheet. Same three-tier shape everywhere: **one or two green levers, two or three grey muscle,
two or three ringless nobodies.**

| Board | Tokens | Green (lever) | Grey (muscle) | Ringless |
|---|---:|---|---|---|
| Western Market, after dark | 7 | Sella Redcott, Wick Harlow | Redcott's Man ×2 | 3 |
| The Vintara Baths | 7 | Aldric Dunwick, Nessa Brightmoor | Vintara Minder ×2 | 3 |
| The Drowned Tap | 8 | Brogmar-dur, Khargrom-dur | Tunnel Runner ×2, Tap Lookout | 3 |
| The Concordance Library | 6 | Ellyn Merrick, Elarion Faenwynd | Corr Ashgate, Ardenford Watch | 2 |

Each journal page gained an **On the board** section: every NPC, where they stand, what they are
doing, and which of the three jobs they are for — *pick a fight · be in the way · be a lever.*

**Positions were chosen off the background art, not guessed.** The maps were read from disk,
downscaled with a 5-square grid overlay, positions picked against real features, then re-rendered
as a contact sheet with the placed tokens drawn on to confirm nobody stands in a wall or in water.
Worth repeating for any future staging — it is cheap and it catches the errors that are invisible
from the document side.

Conversion for all four (4500×3000, grid 150, padding 0.25):
`preview px × 3.75 = image px` · `image + (1200, 750) = canvas` · token x,y is the **top-left** of
its square, so snap with `round((centre − 75) / 150) × 150`.

New actors, in `Ardenford — Misfit Spots (cast)`: **Wick Harlow** (night porter), **Sella Redcott**
(fence), **Nessa Brightmoor** (bath attendant), **Aldric Dunwick** (consul's aide), **Brogmar-dur**
(keeps the Drowned Tap), **Corr Ashgate** (rival delver), and **Ardenford Watch** — the MM Guard,
CR 1/8 but **AC 16**, dressed to the grey mook tier and reusable city-wide.

Muscle reuses the existing **Bandit** actor with per-token renames (`Redcott's Man`,
`Vintara Minder`, `Tunnel Runner`, `Tap Lookout`), so four different gangs cost one actor and the
sidebar stays readable. Nobodies are the ringless **Extras** villagers.

## 2026-09-17 — the cast got gear and a key-9 card

**The hotkey is `9`, not `8`.** `pentaryn-ties` registers six bindings, confirmed live here:

| Key | Does |
|---|---|
| `4` | inspect — the identification cascade (players) |
| `5` | file the hovered token in your character's notebook |
| `6` | add a tie |
| `7` | one tie, on its own |
| `8` | the ties web — everyone this person knows who is in sight |
| **`9`** | **description card — who this person *is*. GM only.** |

`9` reads **`system.details.biography.value`** — the *private* field — and falls back to the
public one only if the private was never filled. So prep goes in the private biography, and that
is what all six cast biographies were rewritten into.

**Card format, built to be read mid-scene rather than studied:** a one-line hook, then
**Type** (a personality label, not a paragraph), **Was / Now** (two sentences of backstory),
**Voice**, then **Wants / Lever / Tell**. Roughly 850 characters each — a glance, not a read.
The *Tell* line is the one that pays off at the table: one physical habit to play them with.

### Gear

Real items from `dnd5e.equipment24` / `dnd5e.items`, each stamped with `_stats.compendiumSource`
per the convention in [`foundry/markers.md`](foundry/markers.md), **plus one bespoke object each**
— the thing actually worth stealing:

| NPC | The object |
|---|---|
| Wick Harlow | **Wick's Tally Board** — evidence against a consul's supplier *and* against Wick |
| Sella Redcott | **Redcott's Purse** |
| Nessa Brightmoor | **Bathhouse Keys** — every door including the unwatched canal dock |
| Aldric Dunwick | **The Unsigned Writ** |
| Brogmar-dur | **The Favour Book** — no coin tab is kept; this is kept instead |
| Corr Ashgate | **Forged Reclamation Writ** — registry number of an expedition that never came back |

`Ardenford Watch` came pre-equipped from the Monster Manual (Spear, Chain Shirt, Shield).

## 2026-10-15 — ready to play: the module set

Brought up live on the Mac (local world, no cloud restore), tunnel left down. Changed by
editing `core.moduleConfiguration` in `worlds/ardenford/data/settings` with both worlds
closed (method: [`foundry/ops.md`](foundry/ops.md) → *Creating a new world*).

**Joe's table does not use character sheets, the Argon HUD for players, portals, cursors or
GM vision**, so only the modules that serve that table were added.

| Module | State | Why |
|---|---|---|
| `pentaryn-prompts` | **on** | prompt markers; the six `Prompt · <size>` actors exist in `Prompt Markers` (made by `ensureMarkers` on ready) |
| `pentaryn-feedback` | **on** | player bug/feature reports |
| `pentaryn-lookup` | **on** | rules lookup (`game.pentaryn.rules`) |
| `pentaryn-senses` | **on** | senses / light |
| `pentaryn-names` | **on** | name generation |
| `pentaryn-aoe` | **on** | area effects; `autoApplySelf`, `highlightUnapplied`, `npcSaveRollMode` copied from `pentaryn` |
| `pentaryn-creatures` | **on** | `ownerSees`, `lightRadius` copied from `pentaryn` |
| `pentaryn-movement` | **off** | Joe's call, 2026-10-15: no player ghost movement (he manages movement himself) |
| `pentaryn-walls` | **removed** | retired 2026-10-13, folder gone |
| `pentaryn-combat`, `-transform`, `-portals`, `-cursors`, `-journal`, `-riders`, `gm-vision` | off | the table doesn't use sheets, the HUD/portals/cursors or GM vision |

Everything already on stayed on (incl. `enhancedcombathud`, `foundry-mcp-bridge`
0.8.3-pentaryn.2). 36 modules active, every `requires` satisfied. Not copied:
`pentaryn-prompts.lastCalls` (per-world log) and `pentaryn-senses.sightReset` (per-world
one-shot migration marker — ardenford runs its own). Load console: no errors, only
scene-packer's v13 global-namespace deprecation warnings.

Backup before the change: local tar `ardenford-2026-10-15-premodules.tgz` (plus the
`pentaryn` settings DB) in that session's scratchpad,
`/private/tmp/claude-501/-Users-joe-Documents-GitHub-pentaryn/00048ef4-fe52-4efe-a872-614236e141a0/scratchpad/`
— temporary; the next `make foundry-down` snapshot is the durable one.

## 2026-10-15 — Temp folder — the Brennick Hall night

Joe's session night in Brennick Hall (an Ardenford keep), in route order:
**prison → wine cellar → feast hall → out a window → courtyard.** Every scene sits in the
top-level Scene folder **`Temp`** (`qRxVEfrNdxuRgRr6`), imported from installed compendiums
with `game.scenes.importFromCompendium` — inactive, off navigation, never viewed or activated
for players. Walls, lights, regions, region behaviors, sounds, tiles and levels match the
compendium source exactly; every background, tile and thumbnail image HEADs 200.

| # | Scene | id | Source pack | Story use |
|---|---|---|---|---|
| 1 | Arena Prison of the Condemned | `3L7PArmd7RTkC8vp` | `pentaryn-seafoot-maps.scenes` | **The prison.** Brennick Hall's gaol, cut into the rock under the keep: two rows of barred cells (~30), an octagonal yard ringed by more cells, guard room with a dice table, warden's office, mess, stores, two round guard posts, and a long stair climbing out on the west side (to the cellar). 738 walls, 17 lights, 16 sounds. The yard floor has a painted blood sigil (it was a fighting pit) — describe it, or cover it. |
| 1-alt | 15. Dungeon | `s7kWp2zIzo5ihsU7` | `mad-endlesswiz.mad-endlesswiz-maps` | **Alternate prison** — a smaller round gaol, as if under one of the keep's towers: a ring of eight barred cells, a guard post with weapon rack and door, and a central grated oubliette with a spiral stair. 164 walls, **only 3 lights** (add torches), 1 tile (the module's journal "reader" icon). Green fog surrounds the tower in the art. The source thumbnail pointed at another world (404), so a new one was made at `worlds/ardenford/assets/scenes/thumb-s7kWp2zIzo5ihsU7.webp`. |
| 2 | Wine Cellar - WINE | `Ge5f1fuKrr54Ftpi` | `eledryll-maps-castle-life-bundle-1.eledryll-maps-castle-life-bundle-1` | Up out of the gaol into the keep's wine cellar. The flooded cellar: a drunk, singing wine elemental; CON save vs poisoned each round spent in the wine. |
| 3 | Brior Keep - Lit (Night - Spring) | `qKZWFtGa3xeZXxWL` | `eledryll-maps-castle-life-bundle-1.eledryll-maps-castle-life-bundle-1` | **The feast hall** — use the Ground-Floor level: the great hall mid-feast. 3 levels (Dungeon / Ground-Floor / 1st floor); both `changeLevel` stair regions intact. **Its Dungeon level was rejected as the prison** (Joe, 2026-10-15: it doesn't read as a prison) — scene 1 replaces it. |
| 4 | Windhorne Castle - Night | `ZlTTWIxVZXDh5ev2` | `eledryll-maps-castle-life-bundle-1.eledryll-maps-castle-life-bundle-1` | **The courtyard** the party drops into from a feast-hall window: First Level = the night bailey — a large cobbled inner court with carts, a well and the gatehouse, a formal garden court behind the north range, lit windows all round. Same Eledryll art as the cellar and hall. 1555 walls, 152 lights, 16 regions (16 behaviors), 3 levels (First Level / Second Level / Roofs), 2 tiles. A separate copy: the original `cEn1DAbKlPfkkju8` stays in `4 · The Keeps`, untouched. |

Searched for the prison and passed over: **City Prison** (`EDJYGMiBk5d0deEg`) — the same gaol
as scene 1 but with city rooftops around it, so it stands in the street rather than under a
keep, and it has 9 lights to scene 1's 17; The Kings Prison and Devils Hold Prison (the same
art in a forest and in lava); the keep basements (Seaside, Clifftop, Abandoned, Adventurers
Seaside); The Wardens Keep and Dragon Lord's Basement (crypts, not cells); the DMG Keep (parchment
style, no gaol); Castle Life has no prison map.

A second, prison-only search (every installed pack plus the other worlds) reached the same
answer: Arena Prison first, 15. Dungeon second. Two things it measured: **most of Arena Prison's
cell bars are fixed walls** (only the five bedded cells along the bottom have working doors, so
add doors where a cell must open), and **no prison map ships a Night variant** (all darkness 0).
Runner-up if working doors matter more than being underground: **The Kings Prison**
(`UTc1KnXPxaa6dSDl`, not imported) — City Prison's layout with all 15 barred doors openable,
but a forest around it.

**Inspiration** — two maps with no planned use, for Joe to browse (also in `Temp`):

| Scene | id | Source pack | Why |
|---|---|---|---|
| Death's Gate | `VhbnfBzDoxOu8mJp` | `pentaryn-seafoot-maps.scenes` | A glowing teal river of drifting skeletons between pillars, ending at a rune dais over a starfield. 83 walls, 26 lights. |
| 13. Golem Forge | `IycAS89J2liH5WUX` | `mad-endlesswiz2.mad-endlesswiz2-maps` | A round workshop split by a lava channel; furnace arch, golem parts, blueprints. 41 walls, 18 lights. New thumbnail at `worlds/ardenford/assets/scenes/thumb-X5MgX90geG42y5E4bgrSSw.webp` (the source one 404'd). |

### 2026-10-15 — Arena Prison populated from Joe's 29 prompt markers

Call `pm-f9fe`, party 3 x L2. All 29 markers replaced with patched Monster Manual stock (actors in
`Foundry MCP Creatures`), each with tokens-01 art as a ring subject:

- **Prisoners (neutral):** Oswin Harrow, Brannoc Tull, Kit Rellan, Old Haskel (knows the place),
  Fenn Marlowe, Ivo Penck, Gorrin Ashby (would help), Nobody Ned, Pip Underbough (halfling), the
  drunks Wendel Pike / Hob & Lem Tanner (Drunk trait = poisoned), Jory "Knuckles" Vane (Tough,
  troublemaker), Silas Crane (Spy, shady, next to the PCs).
- **Staff (neutral):** Clerk Aldo Penwright, secretary Marta Quillon (carries the Prison Intake
  Ledger), Grub the Cook; Mollie Fairweather, the girl distracting the card-table guards.
- **Guards (hostile):** card table Corran / Tobbin / Hesk (Hesk has the Cell-Row Key Ring);
  arena post Big Marga (half-ogre: Ogre cut to CR 1, 45 HP, Int 7), Sgt Dace Orrin (Int 14),
  Grusk (half-orc, Int 6), Pell Wainright; Willet (smoking in the storeroom, Mellow trait) with his
  dealer Dossie Klep (Bandit, neutral); Rudd (Asleep trait); **Warden Bastian Krole** (Bandit
  Captain CR 2, Warden's Master Key — note the stock **Pistol** is still on him).
- Difficulty: card table 75 XP, arena post 275 XP, storeroom 25 XP: all under "low" for 3 x L2.

`07. Child's Bedroom` (`RUKfJ7ogh7Yih0Q4`) was deleted from Temp on Joe's word (2026-10-15), along
with its generated thumbnail. The Day Brior Keep already in the world (`ZQX7eXhy0Oi4CAZO`) is
untouched. Scene count 122 → 121 (delete) → 126 (with the two inspiration maps).

## Still unbuilt

- No map chosen for anything else. Every location is still a candidate list.
- No actors. The Ardenford NPCs in `world/factions/ardenhaven/locations/ardenford/` — Torren
  Ashvale, Selise Dawnquill, Hesta Briarvein, Branik Ironweld, Elarian Faenwynd, Pell
  Orvaine, Khorin Bar'dur, Thessa Kraghammar — exist as lore only.
- **The actor pipeline still targets `space-journey`.** `scripts/foundry/ops/config.py`
  defaults there; importing into this world needs `WORLD=ardenford` until that default
  moves. See [`foundry/ops.md`](foundry/ops.md) §1.
- No session zero. **Joe's party is three level 2**, but Jack, Sean and Zac still have blank sheets —
  dnd5e derives level from class items, so they cannot be set to level 2 until each has a class.
- Thorgrim's four features exist as prose, not as rollable items.
- The 15 `Ardenford — Townsfolk` still have one-line bios and no gear — they have not had the key-9 card treatment.
- The Hideout: marker 2 is spent on the bandits. Markers 1 and 3–9 were deleted; re-place from the `Temp Markers` folder as needed.
- No Ardenford city overview scene, so locations live in the nav bar rather than as pins on a city map.
