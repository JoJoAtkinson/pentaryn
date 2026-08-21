---
title: "Forge ST — context index"
last_modified: 2026-08-18
status: active
tags: [context, index, oneshot, space-journey, twenty-one, foundry]
---

# Forge ST — context index

**Pointer file. Read this, then open only what the task needs.** Do not scan the repo looking
for these — the paths below are current. Line counts are there so you can judge cost before opening.

Campaign: **Space Journey / Twenty-One** — an urban-intrigue one-shot. Villain **Ozmandius**
body-hops and impersonates people. Run in Foundry VTT.

---

## The one-shot — `oneshots/`

| File | Lines | Open it when |
|---|---:|---|
| `space-journey.md` | 1176 | Full campaign doc. **Expensive** — prefer the outline unless you need the whole thing. |
| `space-journey-story-outline.md` | ~890 | The **nine** locked scenes, beat by beat. **Expensive.** The usual source for "what happens in scene N". |
| `twenty-one-background-cast.md` | 328 | Who the named NPCs are. |
| `twenty-one-roster.md` | 266 | Cast roster / stat pointers. |
| `twenty-one-social-map.md` | ~480 | Who knows who + **token placement rules** (tie strength 1–5). Read before placing crowds. **§7 is the PCs' own web** — Fairfield hometown, 34 edges, the Ned brothers, and four scene consequences. |
| `space-journey-pregens.md` | 258 | The 8 pregens. ⚠️ Stale for the 2 in play — see next row. |
| `space-journey-pc-tuneup.md` | 276 | **The 2 PCs actually in play.** Current sheets, gear, social ties, open DM rulings, Foundry edit gotchas. |
| `space-journey-player-handout.md` | 153 | Player-facing handout. |
| `_V3-ALIGNMENT-PROGRESS.md` | 152 | Alignment/progress tracking. |

**Only two PCs are in play.** Ignore the other six pregens unless told otherwise.

---

## Foundry

World `ardenhaven` · Foundry **v14.365** · system **dnd5e 5.3.3** · **D&D 2024 rules**
Use 2024 compendium packs: `dnd5e.spells24`, `dnd5e.equipment24`, `dnd5e.feats24`,
`dnd-players-handbook.*`. Not the 2014 `dnd5e.items` pack unless an item exists only there.

**Tools:** `mcp__foundry__*` (world ops; `eval-js` is the escape hatch).
`mcp__dnd-scripts__*` (SRD lookups, campaign-time math, repo ops).

📍 **[`foundry-markers.md`](foundry-markers.md) — read before acting on "put X here" or "replace
the red one".** Colour and numbered marker tokens, the centre-on-the-marker placement contract,
canvas-vs-image coordinates, the eye hotspot icon, and the Item Piles image gotcha.

📍 **[`foundry-scene-links.md`](foundry-scene-links.md) — read before building "the party goes
upstairs".** Native Region + Teleport Token behavior: the two-region cross-reference, the field
table, the **travel-glyph indicator** every link gets, and the gotchas (a GM must be online for
cross-scene, token ids don't survive the trip, bystanders get pulled along). Core Foundry, no
module.

📍 **[`foundry-fire.md`](foundry-fire.md) — read before "set it on fire" / "the building goes
up".** The **Fire Kit**: 22 looping alpha webms as ordinary video Tiles, 16 Mass Edit presets
(brush-paintable, random variant + rotation), 5 GM macros — including
`🔥 Fire · reveal (it takes)`, which blooms pre-placed hidden fire outward from its seat. Built
for Scene 06. Core Foundry + Mass Edit, no new module.

### IDs worth not re-deriving

| Thing | ID |
|---|---|
| Ballad Quinn — Bard, **Kris** | `opMBKiyGpxSJQkg7` |
| Pip Locksley — Rogue, **Kyle** | `mfkhAL0SzLJ34KfA` |
| Ozmandius | `0SBW8nOwhLVK02gr` |
| Pell Ashgrove | `6ls7GNZ44tjHQrZh` |
| Scene · Trophy Gallery (Run 20) — **PCs placed here** | `OyBj2br7fV2Lzuyx` |
| Scene · Fairfield Market (The Lynching) | `nYyAB1zyjGzM3hxq` |
| Scene · Spider's Tear Opera House (The Fire) | `wXQv4IXwvidPTB5P` |
| Actor folder · Scene Extras | `vRftiEyEJHALp2wD` |
| Scene · Dragonsfall Tavern Night (Scene 4, the siege) | `ybhtwisDIVzStzYf` |
| Scene · **Dragonsfall Tavern Night (The Quiet Night)** — Scene 5 ground floor | `1yLNc6k8D9oMRAL6` |
| Scene · **Dragonsfall Tavern 2nd Floor Night (The Quiet Night)** — Scene 5, party's rooms | `QpdCNgmONNaqUyY4` |
| Scene · Dragonsfall Tavern 2nd Floor Night — Scene 4's escape route | `vTcX7LcWsO8hp46A` |
| Scene · Town of Hanged Men — **cut scene, parked** | `IhtEvDukRGFw08ZX` |
| Scene · **The Parley** (Scene 8, archmage's quarters) | `3fDdDnTdphcUDTnB` |
| Actor folder · Scene Props (hotspot template lives here) | `GJT8jxCi9jo3GTLZ` |
| Actor · `Hotspot · Look (template)` | `rslIK014qoMl6YL5` |
| Actor · Vharuk, the Ninth-Bound (Scene 8 bound demon) | `B3HoiyZyBbR6WVqh` |

**The night is nine scenes (cut 2026-08-16).** *The Short Drop* is gone — it was Scene 3 with a
fail state pre-applied, and the arch has to finish in one sitting. Old 5–10 renumbered to 4–9.

**Scene 5 — The Quiet Night — moved into the Dragonsfall** (same day). Same inn as Scene 4, two
hours later (siege at nine, this at eleven): party bedded down upstairs, **Oz downstairs in
`Fenna` with the best bottle in the house**, `OBVIOUS`, working out that he can taste it. He wants them to rest;
threatened, he welcomes it and names the price. Grimsby is parked (not renamed), and **the inn no
longer burns in Scene 4**.

**Built 2026-08-16.** The Scene 5 scene document exists — same art/walls/lights as Scene 4, **10
tokens** placed (see the outline for who is awake and why), plus **3 lodgers** on the 2nd floor.

**Ground-floor guest wing populated 2026-08-18.** Markers 1–7 were the seven beds in the west
lodging wing; all seven consumed. Six new `Scene Extras` NPCs plus one re-used from Scene 3 —
commoners of the sort a river market town puts up on market night, most of them awake:

| Bed | Who | What they're worth |
|---|---|---|
| 1 (by the taproom wall) | **Rab Sowerby**, drover | slept through the whole fight — comedy, plus how much noise the house swallows |
| 2 | **Tomas Quillby**, carter | the ride out at first light, coin, no questions, no witnessing |
| 3 (the single west bed) | **Merrit Vane**, cloth factor | a travel ledger nobody arranged; angry rather than frightened |
| 4 | **Pate**, rope-seller (Scene 3 cast) | the forty feet of hemp bought *before* the accusation — second chance if the square missed him |
| 5 | **Alys Tunner**, midwife | free healing and free bandages; stayed here last spring — outside corroboration of Cobb's nine days |
| 6 | **Ferris Crome**, pilgrim | willing hands, no questions; saw the square fill this morning from outside it |
| 7 (far corner) | **Dunnal Wick**, bargeman | heard the six men in the **back yard** before the door went in — the back half of Ansa Pike's hour |

Two beds left deliberately empty. Ties flags authored on all six new actors (Sowerby↔Quillby,
Vane↔Wat/Latch, Tunner↔Nessa/Aldous, Crome↔Aldous/Tunner, Wick↔Rojan/Pike).
Same pass fixed **Nessa Wetherby's biography**, which was a verbatim copy of Old Cobb's, and
**Pate's**, which still read *Scene 4 — The Short Drop*.

### Folders — there are TWO parallel trees, and both matter

Renumbering the night means renaming **both**. Missing one is the easy mistake.

| Tree | Root | Now reads |
|---|---|---|
| **Scene** folders | `Space Journey — Story` | `SJ 01 Run Twenty` · `02 The Road to Town` · `03 The Market Square` · `04 Last Orders` · `05 The Quiet Night` · `06 The Fire` · `07 The Guide` · `08 The Parley` · `09 Twenty-One` |
| **Actor** folders | (top level) | `SJ 02 …` · `SJ 03 …` · `SJ 04 — Last Orders` · `SJ 06 — The Fire` · `SJ — cut: The Short Drop` · `Ozmandius the Unmade (Scenes 1, 8 & 9)` |

`v3 — cut — The Short Drop` (both Hanged Men scenes) now lives under **Recycle**.

**Nav bar is curated: 100→900, nine scenes.** `400/410/420` are the Dragonsfall's three floors,
`500`/`510` are the Quiet Night's own ground floor and second floor — **separate documents** on the
same art, because the party sleeps upstairs and Scene 4's second floor is a mid-fight escape route. Cut and parked scenes are **off the nav bar**
(`navigation: false`) but not renamed and not deleted: `Town of Hanged Men` ×2, `Hamlet of Grimsby`,
`Demonically Tainted Hamlet of Grimsby`.

⚠ **Grimsby still sits in `SJ 05 — The Quiet Night` next to the live scene**, and both are prefixed
`1.` — deliberate (both versions of one scene together) but easy to misclick. Rename it if that bites.

**Possession is marked per-token, not per-actor** (`pentaryn-ties` 0.5.0). Token HUD →
masks-theater button, GM-only, `token.flags["pentaryn-ties"].worn = {by, note}`. Set on all four v3 hosts:
**Rennick** (S2), **Big Ned** (S3), **Harl Wetherby** (S4), **Fenna** (S5). The old on-sheet
`Oz's Vessel` / `Worn, Not Ruled` feats are **deleted** — text archived in
[`oneshots/_retired-vessel-items.md`](../oneshots/_retired-vessel-items.md). Never mark a host on the actor — the same actor appears in
more than one scene, and the ties graph must keep showing the *host's* own relationships, because
those are what Oz is spending. See [`playbooks/foundry-npc-ties.md`](../playbooks/foundry-npc-ties.md).

**Scene 8 — The Parley is stocked (2026-08-17).** Eight markers consumed, five Item Piles loot
hotspots, one hidden demon and two readable Journal-Note pins:

| Marker | Became | Holds |
|---|---|---|
| 1 | `Hanging Cloak` | Cloak of Displacement |
| 2 | `The Staff Rack` | Staffs of Charming, Swarming Insects, Withering, the Python |
| 3 | `The Feathered Hat` | Hat of Disguise |
| 4 | `Vharuk` — **hidden**, hostile, Large, on the summoning circle | CR 4 bound demon |
| 5 | `The Potion Chest` | Superior/Greater/Healing ×1/3/4, Invisibility, Mind Reading, Heroism ×2 |
| 6 | Note → **The Scrying Orb** | description only — the town from above, the Dragonsfall roof |
| 7 | `The Display Case` | Staff of Healing |
| 8 | Note → **The Binding Words** | the incantation that binds Vharuk, GM ruling in a secret block |

Vharuk starts hidden and hostile; on a successful binding the GM unhides it and flips disposition.
The DC and failure branch live in the `secret` section of The Binding Words and on Vharuk's
**Bound Servant** feature. Full build recipe and the Item Piles gotchas are in
[`foundry-markers.md`](foundry-markers.md).

⚠ **Only outstanding build job in the night:** lighting `Catacombs of Silence`.

### Token conventions (already applied world-wide)

Ring tiers: **gold** `#ffcc4d` PC · **red** `#d8433a` foe · **green** `#86c98a` named/talkable ·
**grey** `#9098a0` mook · **no ring** = crowd.
Subject textures follow Foundry's ⅔ safe-area spec, in
`FoundryVTT/Data/assets/tokens/custom/ring-subjects/`. Muted crowd art in `.../generic-villagers/`.
Build one with `scripts/foundry/ring_subject.py`.

**Rotation is locked world-wide.** `lockRotation: true` on every actor prototype and every
placed token, and `core.prototypeTokenOverrides.*.lockRotation = true` so new tokens inherit it.
Tokens face their art's orientation and never spin toward the direction of travel. Don't
re-enable it per-token without asking.

**A ringed token draws `ring.subject.texture`, not `texture.src`.** Re-art one without the
subject and it silently keeps the old picture — looks like a stale client, isn't. Placed
tokens don't inherit prototype changes either. See `scripts/foundry/README.md`.

**A ringless crowd token draws the opposite field — `texture.src`.** So crowd art gets the
⅔ subject webp in **both** `texture.src` and `ring.subject.texture`; point `texture.src` at
the raw art and the crowd renders 1.5× the ringed NPCs beside it. Fixed world-wide
2026-08-16 (13 prototypes, 103 placed tokens). Sweep snippet in `scripts/foundry/README.md`.

**Standing quirk:** derived token/actor data goes stale after writes. Verify with
`actor.reset()` or `await canvas.draw()`, never by reading `_source`.

---

## Playbooks — `playbooks/`

| File | For |
|---|---|
| `foundry-ops.md` | Day-to-day Foundry operations. **Start here for Foundry work.** |
| `foundry-vtt.md` | The programmatic campaign pipeline. |
| `foundry-npc-ties.md` | NPC tie/social-graph design. |
| `foundry-wall-autocomplete.md` | Completing hand-drawn walls. |
| `foundry-mcp-fork.md` | The MCP bridge fork design. |
| `roll20-map-prep.md` | Roll20 → Foundry map prep. |

## Scripts & data

- `scripts/foundry/` — `build_actors.py`, `build_scenes.py`, `prep_map.py`, `cloud.py`,
  `license_key.py` (secrets via Infisical, never a `.env`), `seafoot_v9_to_v14.py`,
  `ring_subject.py`, `travel_glyph.py` (scene-link indicator art)
- `foundry/CONTRACT.md` — the `actors.json` generator ⇄ importer contract
- `foundry/assets-manifest.json`, `foundry/roll20-maps.json`, `foundry/map-library-plan.md`

## Don't open

`.cache/` · `.output/` · `.history/` · `.venv/` · `__pycache__/` · `world/**/_history.*.svg` ·
`world/**/_timeline.*.svg` — build artifacts, high token cost, no signal.

## Also see

`CLAUDE.md` and `AGENTS.md` at repo root — conventions, MCP golden rule, combat-runner docs.
