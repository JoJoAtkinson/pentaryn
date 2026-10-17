---
title: "Plans — how things were built"
status: active
last_modified: 2026-10-10
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
| [`map-library-design-2026.md`](map-library-design-2026.md) | A reorganised map library (sets/scenes tree, manifest, contact sheet, AI captions) | never built — the library as it is: [`../foundry/map-library.md`](../foundry/map-library.md) |
| [`foundry-importer-verification.md`](foundry-importer-verification.md) | How `pentaryn-importer` 1.0 was verified, and what was left for Gate 2 | history |
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
| [`cursors-design.md`](cursors-design.md) | The `pentaryn-cursors` tool-cursor set: rules, glyph choice, hotspots (moved out of the module, cursors guide step 8) | built (0.1.0); history only |
| [`wildshape-hud-design.md`](wildshape-hud-design.md) | The 0.2 design for Wild Shape on the HUD (moved out of the module, transform-creatures-19) | superseded; history only |
| [`dnd5e-6-upgrade.md`](dnd5e-6-upgrade.md) | dnd5e 5.3.3 to 6.0.6: backups, per-module port, retired-for-native, Argon playtest, rollback recipe | executed 2026-10-10, kept 6.0.6 |
| [`foundry-update-2026-10.md`](foundry-update-2026-10.md) | Attended October 2026 update: core 14.369, Dice So Nice, mad-endlesswiz2; dnd5e 6 go/no-go, rollback rule, regression checklist | executed 2026-10-10 |
| [`smarter-updater.md`](smarter-updater.md) | Tiered escalation for the Saturday updater: Haiku triage, Opus analysis, Fable go/no-go, sandboxed Opus fix; adjustments registry and the "Still needed?" phase | v1 built 2026-10-10 (triage + analysis, `max_tier: analyze`); v2/v3 designed |
| [`prompt-markers.md`](prompt-markers.md) | Prompt markers: six sized marker actors, the drop-to-type dialog with an LOS side panel, the one-call `prompt-markers` gather/replace tool in the bridge fork, the `pentaryn-prompts` module | built, installed, UX-playtested and LLM-evaluated 2026-10-10; eval follow-ups open (section 12) |
| [`melee-streamlining.md`](melee-streamlining.md) | `pentaryn-combat`: Full Attack on the Argon HUD (Extra Attack / Multiattack / Flurry swings, pause-retarget-swap), swing pips, bonus-action follow-ups (Off-hand, Nick, Flurry, Hew), once-per-turn rider offers (Sneak Attack), off-hand mode/pip fixes, PC weapon-set seeding, manual-dice safe | built, adversarially reviewed (24 fixes, §15.4), synced and enabled 2026-10-10; usability-tested on the GM client, player-tab playtest still owed |
| [`usability-test-plan-2026-10.md`](usability-test-plan-2026-10.md) | Player-usability test plan over everything built so far: nine live areas (turn flow, Full Attack and off-hand, once-per-turn riders, druid forms, sorcerer, wizard, attributes and no-leak sweep, exploration, prompt markers), click budgets, own-dice and one-at-a-time checks, ZZ test characters, cleanup case Z; changes go to the ledger below, results to the report | run 2026-10-10 (areas overlapped; most live player-tab cases blocked — re-run one area at a time) |
| [`usability-changes-2026-10.md`](usability-changes-2026-10.md) | Ledger of every change the usability run applied (U-ids, with files, revert and retest steps) plus each area's open proposals (P-ids) | append-only; 32 U-entries, 44 proposals |
| [`usability-report-2026-10.md`](usability-report-2026-10.md) | Findings of the usability run: verdict per area, click counts, bugs fixed, proposals ranked by player impact, what to test next session | written 2026-10-10 |
| [`code-audit-2026-10.md`](code-audit-2026-10.md) | Behaviour-preserving audit of every addon, the Python tooling and the MCP fork: per-addon findings in [`code-audit-2026-10/`](code-audit-2026-10/README.md), shared kit design, sequenced waves | active — not started |
| [`addon-blueprint-2026-10/`](addon-blueprint-2026-10/README.md) | Fix-phase plan for the audit: merged wave order and one migration guide per module (design rationale in [`addon-blueprint-2026-10.md`](addon-blueprint-2026-10.md)) | active — not started; WAIT lifted 2026-10-11 |
| [`feedback-module-2026-10.md`](feedback-module-2026-10.md) | `pentaryn-feedback`: the in-world bug / defect / feature reporter — market survey and BUILD decision, the per-client action/error recorder, the User-flag queue + `ingest` relay to the GM's disk, the `feedback_*` MCP review tools | built 2026-10-11 (unit-tested; not yet synced or tested live) — use-doc [`../foundry/feedback.md`](../foundry/feedback.md) |
| [`rclone-two-hosts-2026-10.md`](rclone-two-hosts-2026-10.md) | Two hosts, one cloud: the rclone storage layer, host tags and roles, the boot choice, lineage sidecars, per-host coalescing and pruning | built and merged 2026-10-11 (go-live §15); extended by [`module-bundles-2026-10.md`](module-bundles-2026-10.md) — use-doc [`../foundry/ops.md`](../foundry/ops.md) §3 |
| [`module-bundles-2026-10.md`](module-bundles-2026-10.md) | World snapshot → worlds+Config; modules and systems as content-addressed bundles shared by both hosts; mark-and-sweep GC | built 2026-10-11 on feature/module-bundles; main merged in per §5 (§14); go-live pending (§10, §15) |
| [`pin-2026-10.md`](pin-2026-10.md) | `pentaryn-pins` (pinned characters, GM canvas menu), portals `teleportToken` | shipped 2026-10-17 — use-doc [`../foundry/pins.md`](../foundry/pins.md); review fixes [`pin-2026-10-review-max-fixes.md`](pin-2026-10-review-max-fixes.md) (uncommitted, awaiting follow-up) |
| [`world/timeline-refactor.md`](world/timeline-refactor.md) | History TSVs → per-event markdown under `history/` | complete |
| [`obsidian-first-migration.md`](obsidian-first-migration.md) | Wikilinks + tag-based multi-home, Obsidian alongside VS Code | proposed — nothing executed |

**Adding one:** design a system → write the plan here. Ship it → write the use-doc in its
domain folder and link back. Don't leave the plan as the only documentation.
