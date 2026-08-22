---
title: "Plans — how things were built"
status: active
last_modified: 2026-08-22
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
| [`foundry-wall-autocomplete.md`](foundry-wall-autocomplete.md) | The `pentaryn-walls` engine + WASM backend | shipped |
| [`foundry-mcp-fork.md`](foundry-mcp-fork.md) | The forked Foundry MCP bridge (now at `~/Documents/GitHub/foundry-vtt-mcp`) | shipped |
| [`seafoot-v14-migration.md`](seafoot-v14-migration.md) | 520 v9 map modules → one v14 module | complete |
| [`world/timeline-refactor.md`](world/timeline-refactor.md) | History TSVs → per-event markdown under `history/` | complete |

**Adding one:** design a system → write the plan here. Ship it → write the use-doc in its
domain folder and link back. Don't leave the plan as the only documentation.
