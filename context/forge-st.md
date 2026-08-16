---
title: "Forge ST — context index"
last_modified: 2026-08-16
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
| `space-journey-story-outline.md` | 954 | The ten locked scenes, beat by beat. **Expensive.** The usual source for "what happens in scene N". |
| `twenty-one-background-cast.md` | 328 | Who the named NPCs are. |
| `twenty-one-roster.md` | 266 | Cast roster / stat pointers. |
| `twenty-one-social-map.md` | 265 | Who knows who + **token placement rules** (tie strength 1–5). Read before placing crowds. |
| `space-journey-pregens.md` | 258 | The 8 pregens. ⚠️ Stale for the 2 in play — see next row. |
| `space-journey-pc-tuneup.md` | 233 | **The 2 PCs actually in play.** Current sheets, gear, open DM rulings, Foundry edit gotchas. |
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

### Token conventions (already applied world-wide)

Ring tiers: **gold** `#ffcc4d` PC · **red** `#d8433a` foe · **green** `#86c98a` named/talkable ·
**grey** `#9098a0` mook · **no ring** = crowd.
Subject textures follow Foundry's ⅔ safe-area spec, in
`FoundryVTT/Data/assets/tokens/custom/ring-subjects/`. Muted crowd art in `.../generic-villagers/`.

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
  `license_key.py` (secrets via Infisical, never a `.env`), `seafoot_v9_to_v14.py`
- `foundry/CONTRACT.md` — the `actors.json` generator ⇄ importer contract
- `foundry/assets-manifest.json`, `foundry/roll20-maps.json`, `foundry/map-library-plan.md`

## Don't open

`.cache/` · `.output/` · `.history/` · `.venv/` · `__pycache__/` · `world/**/_history.*.svg` ·
`world/**/_timeline.*.svg` — build artifacts, high token cost, no signal.

## Also see

`CLAUDE.md` and `AGENTS.md` at repo root — conventions, MCP golden rule, combat-runner docs.
