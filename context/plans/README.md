---
title: "Plans — how things were built"
status: active
last_modified: 2026-08-23
tags: [context, plans, history]
---

# Plans — how things were built

**Read this when:** you need to understand or change how something in this repo was
designed, or why a migration went the way it did.
**Not this file:** operating any of it → [`../foundry/README.md`](../foundry/README.md) ·
lore authoring → [`../world/README.md`](../world/README.md)

> **These are history, not instructions.** A plan describes building a thing. Never load one
> to operate the thing it describes — the use-doc lives in the domain folder or, for a
> module, in the module's own README. Plans are kept, not pruned: a superseded plan still
> explains why the current design looks the way it does.

| Plan | Built what | Status |
|---|---|---|
| [`foundry-content-pipeline.md`](foundry-content-pipeline.md) | Repo content → Foundry documents (actors, scenes, walls, lights) | partly executed — see its own status line |
| [`foundry-npc-ties.md`](foundry-npc-ties.md) | The `pentaryn-ties` module | shipped |
| [`foundry-npc-ties-gui.md`](foundry-npc-ties-gui.md) | The ties sheet GUI — read rows, the tie dialog, inbound view | shipped through 0.10.0; iterations 3–4 in build |
| [`foundry-encounter-log.md`](foundry-encounter-log.md) | Known list / Study rolls / Past Encounters tabs in `pentaryn-ties` | phase 1 built; rest proposed |
| [`foundry-disguise.md`](foundry-disguise.md) | The disguise pointer mask beside `worn` — layered persona redirect + hidden Investigation checks | proposed |
| [`foundry-wall-autocomplete.md`](foundry-wall-autocomplete.md) | The `pentaryn-walls` engine + WASM backend | shipped |
| [`foundry-attunement.md`](foundry-attunement.md) | The `pentaryn-attunement` sidebar slot strip + over-cap warnings | shipped |
| [`foundry-mcp-fork.md`](foundry-mcp-fork.md) | The forked Foundry MCP bridge (now at `~/Documents/GitHub/foundry-vtt-mcp`) | shipped |
| [`seafoot-v14-migration.md`](seafoot-v14-migration.md) | 520 v9 map modules → one v14 module | complete |
| [`table-feedback-2026-10-08.md`](table-feedback-2026-10-08.md) | Triage of player feedback from the Underdark one-shot: bugs, rules riders, UX design questions | built and playtested 2026-10-09 |
| [`druid-wild-shape.md`](druid-wild-shape.md) | Talo's Wild Shape and Starry Form on the Argon HUD (`pentaryn-transform` 0.2-0.3) | built; playtest 2026-10-10 passed core, audit items open |
| [`dnd5e-6-upgrade.md`](dnd5e-6-upgrade.md) | dnd5e 5.3.3 to 6.0.6: backups, per-module port, retired-for-native, Argon playtest, rollback recipe | executed 2026-10-10, kept 6.0.6 |
| [`foundry-update-2026-10.md`](foundry-update-2026-10.md) | Attended October 2026 update: core 14.369, Dice So Nice, mad-endlesswiz2; dnd5e 6 go/no-go, rollback rule, regression checklist | executed 2026-10-10 |
| [`smarter-updater.md`](smarter-updater.md) | Tiered escalation for the Saturday updater: Haiku triage, Opus analysis, Fable go/no-go, sandboxed Opus fix; adjustments registry and the "Still needed?" phase | v1 built 2026-10-10 (triage + analysis, `max_tier: analyze`); v2/v3 designed |
| [`world/timeline-refactor.md`](world/timeline-refactor.md) | History TSVs → per-event markdown under `history/` | complete |
| [`obsidian-first-migration.md`](obsidian-first-migration.md) | Wikilinks + tag-based multi-home, Obsidian alongside VS Code | proposed — nothing executed |

**Adding one:** design a system → write the plan here. Ship it → write the use-doc in its
domain folder and link back. Don't leave the plan as the only documentation.
