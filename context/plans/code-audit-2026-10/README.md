---
title: "Code audit 2026-10 — index"
status: active
last_modified: 2026-10-10
tags: [plans, audit, index]
---

# Code audit 2026-10 — index

> **Re-anchored to 4e64f47 on 2026-10-11** (attunement and movement rows). **Re-anchored to 28ccc87 on 2026-10-11** (riders row; Total set to the master plan's category table, which also counts the creatures and portals additions; aoe row, +aoe-movement-portals-44; combat row, +combat-riders-36…-38).

**Read this when:** you want the per-addon finding files of the 2026-10 code audit.
**Not this file:** the programme, totals and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

| File | Covers | Findings | High impact |
|---|---|---|---|
| [`ties.md`](ties.md) | pentaryn-ties | 43 | 8 |
| [`prompts.md`](prompts.md) | pentaryn-prompts | 21 | 0 |
| [`lookup.md`](lookup.md) | pentaryn-lookup | 8 | 3 |
| [`combat.md`](combat.md) | pentaryn-combat (**WAIT**) | 30 (re-anchored to 28ccc87 on 2026-10-11, +3 new) | 5 |
| [`riders.md`](riders.md) | pentaryn-riders | 8 (re-anchored to 28ccc87 on 2026-10-11, +2 new) | 0 |
| [`transform.md`](transform.md) | pentaryn-transform (**WAIT**) | 24 | 1 |
| [`creatures.md`](creatures.md) | pentaryn-creatures | 8 | 0 |
| [`names.md`](names.md) | pentaryn-names | 3 | 0 |
| [`pings.md`](pings.md) | pentaryn-pings | 3 | 0 |
| [`senses.md`](senses.md) | pentaryn-senses | 20 | 1 |
| [`walls.md`](walls.md) | pentaryn-walls | 13 | 2 |
| [`cursors.md`](cursors.md) | pentaryn-cursors | 4 | 0 |
| [`aoe.md`](aoe.md) | pentaryn-aoe (**WAIT**) | 17 | 1 |
| [`movement.md`](movement.md) | pentaryn-movement | 9 (re-anchored to 4e64f47 on 2026-10-11, +1 new) | 0 |
| [`portals.md`](portals.md) | pentaryn-portals | 12 | 2 |
| [`importer.md`](importer.md) | pentaryn-importer | 7 | 2 |
| [`attunement.md`](attunement.md) | pentaryn-attunement | 10 (re-anchored to 4e64f47 on 2026-10-11, +1 new) | 1 |
| [`dropbin.md`](dropbin.md) | pentaryn-dropbin | 13 | 1 |
| [`journal.md`](journal.md) | pentaryn-journal | 7 | 0 |
| [`python-tooling.md`](python-tooling.md) | Python tooling (Makefile, ops, updater, content, MCP server, dnd-scripts tools, tests) | 52 | 4 |
| [`mcp-fork.md`](mcp-fork.md) | MCP fork (foundry-vtt-mcp, branch pentaryn) | 26 | 4 |
| **Total** | | **338** | **35** |

Each addon file ends with a *Categories checked with no finding* section (or *Files added to the audit after the first pass*) recording what was looked at where a category has no finding.
