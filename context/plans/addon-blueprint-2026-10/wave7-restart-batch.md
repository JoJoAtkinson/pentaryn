---
title: Addon blueprint — Wave 7 restart batch (module.json edits, consolidated)
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, wave7]
---

# Wave 7 restart batch — every `module.json` edit in one list

> **Re-anchored to 4e64f47 on 2026-10-11** (creatures and portals rows). **Re-anchored to 28ccc87 on 2026-10-11** (riders row; aoe row; combat row).

**Read this when:** you are assembling the Stage 3 restart (or the final Wave 7b batch for WAIT
modules), or a guide's Record step tells you to append a deferred `module.json` edit. **Not this
file:** why the batch exists → [`README.md`](README.md) §3 Stage 3 · each module's full step → its
`migrate-pentaryn-<m>.md` (the "Source" column).

`module.json` is read at Foundry startup: every row here needs a **restart**, so they ship together —
one sync, one restart, one live smoke per module. Ship a `_loc` / lang-key switch in the **same**
sync as its `languages` entry, or players see raw keys. A module's code changes that depend on a row
(the lang switch, the walls data migration, the `NS/CSS/FLAG_SCOPE` pins in `core.test.mjs`) are
listed in the last column and land in the same batch.

Common to every row unless the row says otherwise: `flags.pentaryn.generation: 14`,
`flags.pentaryn.afterSync` = the module's current `after_sync` tuple from
`scripts/foundry/ops/config.py` (verbatim) — **and the same commit deletes that tuple from the
module's `ModuleSpec`** (config.py reads `module.json` first; one source per module, never both) —
and `flagScope` = the module id. If a row's commit bumps `version`, the module's core `VERSION`
constant changes in the same commit (movement's and dropbin's tests pin the two equal). **Only walls moves
data** (C07 now says "DATA migration" for walls and "manifest-only" for the rest).

## Batch 1 — Stage 3 (non-WAIT modules)

| Module | `flags.pentaryn` (tier · namespace · cssPrefix) | Other `module.json` edits | Code in the same batch | Source |
|---|---|---|---|---|
| importer | full · `importer` · `pim-` — **merge into the existing object** (the version gate reads `contract`, `targetSystem`, `targetSystemVersion`, `generation`); `flagScope` per D5 | `compatibility.minimum: "14"` | glue-test module-flags stub gains the keys | importer step 9 |
| names | small · `names` · `pnm-` | `compatibility.minimum: "14"` | `NS/CSS/FLAG_SCOPE` pins in `core.test.mjs` (now `test/core-meta.test.mjs`, the names owner's follow-up) | names step 9 — **manifest landed** (wave 1 integration; restart pending) |
| pings | small · `pings` · `ppg-` — **landed** with `minimum: "14"` (wave 1 integration; restart pending) | `languages: [{lang:"en", name:"English", path:"lang/en.json"}]` — **still open** (needs the frozen `max` register pin edit; see wave-1-report) | new `lang/en.json`; `max` row → `PENTARYN_PINGS.Setting.max.Name/Hint`; `log` row → `store: true`; `i18n.test.mjs`; the one golden edit (the `max` register pin) | pings step 10 |
| cursors | small · `cursors` · `pcur-` | `compatibility: { minimum: "14", verified: "14.369" }` | — (step 9's nested lang is reload-only, earlier) | cursors step 11 — **landed** (wave 1 integration; restart pending) |
| lookup | full · `rules` (≠ id) · `plk-` | `compatibility.minimum: "13" → "14"` (clears C07, C02) | — | lookup W1 (wave 2 lane: confirmed) |
| movement | full · `movement` · `pm-` | `styles: ["styles/movement.css"]` + `git mv movement.css styles/movement.css`; `compatibility: { minimum: "14", verified: "14.369" }`. `afterSync` is the current tuple, all three lines (keeps "Players get a Ghost toggle…") | — (the `after_sync` tuple deletion per the common rule) | movement §5 "Wave 7 items" (wave 2 lane, `7b4fdc24`) |
| walls | full · `walls` · `pw-` | `languages` (en); `compatibility: { minimum: "14", verified: "14.369" }`; `description` fix (-8) | `git mv test/fixtures/lang-en.wave7.json lang/en.json` (-36), rows/toasts to full-key literals (needs W2-WALLS-1, and W2-WALLS-3 for the toasts); **flag-scope data migration** `wall-autocomplete` → `pentaryn-walls` (`migrations.mjs`, GM-only, idempotent; declared B6): a hidden `migrationVersion` store row (Number, default 0) and `ctx.exposed.migrateFlagScope({version, log})` in `onReady` behind `isActiveGM()`; `core/engine.mjs` `FLAG_SCOPE = "pentaryn-walls"`, the manifest `flagScope` and `flags.writes`, and **flip the frozen `test/core.test.mjs:14` FLAG_SCOPE pin to `"pentaryn-walls"` ([declared], same commit)**, re-pinning `golden/engine.json`, `golden/backend-drift.json`, `golden/describe.json` and the `api.test.mjs` flags case in that commit | walls step 10 (guide §Result; wave-2 report walls handoff) |
| attunement | full · `attunement` · `pentaryn-attunement-` | `relationships.recommends` item-piles + reason; `compatibility.minimum: "14"`; `styles: ["styles/attunement.css"]` + move; `languages` | `lang/en.json` (inert until step 8's `_loc`) | attunement step 9 |
| journal | full · `journal` · `pj-` | `relationships.systems` dnd5e (min 6.0, verified 6.0.6) — clears the C03 failure R7 now reports; `recommends` item-piles + reason; `styles: ["styles/journal.css"]` + `git mv foundry/module/pentaryn-journal/journal.css foundry/module/pentaryn-journal/styles/journal.css` | README.md Files table: `journal.css` → `styles/journal.css` (same commit as the move) | journal step 9 |
| dropbin | full · `dropbin` · `pd-` | `recommends` item-piles (drop capture, corpse piles, Loot all, container locks), itempilesdnd5e (the rarity i18n shim); `requires: socketlib` stays; `minimum: "14"` (clears C07, C09, C02) | — (a `version` bump moves `VERSION` in `dropbin-core.mjs`; `test/core-barrel.test.mjs` pins them equal) | dropbin step 11 |
| prompts | full · `prompts` · `pp-` (`flagScope`, `generation` already present) | — | — | prompts W1 |
| ties | full · `ties` · `pt-` | `compatibility: { minimum: "14", verified: "14.369" }`; `recommends` item-piles, dice-so-nice (+ reasons) | — | ties S14 |

## Batch 2 — Wave 7b (WAIT modules), or fold into batch 1 if Joe lifts them first

| Module | `flags.pentaryn` (tier · namespace · cssPrefix) | Other `module.json` edits | Code in the same batch | Source |
|---|---|---|---|---|
| creatures | full · `creatures` · `pcr-` | `recommends` item-piles + reason, and enhancedcombathud + reason (the re-run's `placeStrip` targets Argon's DOM, U-6-12); `styles: ["styles/creatures.css"]` + move | `NS/CSS/FLAG_SCOPE` pins | creatures step 10 |
| portals | full · `portals` · `ppt-` | `styles: ["styles/portals.css"]`; `recommends` item-piles + reason; `languages` | **i18n (-29)**: `lang/en.json`, `_loc` full-key literals, settings keys (three rows since the re-run, plus the `plainQuestion` and party-confirm strings) — never before `languages` is live | portals W7 |
| senses | full · `senses` · `ps-` | `minimum: "14"`; `recommends` enhancedcombathud + reason | — (`ps-` clears C37 with no CSS edit) | senses step 13 |
| riders | full · `riders` · `pr-` | `recommends` enhancedcombathud, enhancedcombathud-dnd5e (+ reasons; since the re-run both are named in argon-tidy.mjs and rituals.mjs — Longer casts, Metamagic no-picker, tooltip roll data, see guide S10); `styles: ["styles/riders.css"]` + `git mv`; `verified: "14.369"` | — | riders S10 |
| aoe | full · `aoe` · `pa-` | `recommends` enhancedcombathud, item-piles (+ reasons); `styles: ["styles/aoe.css"]`; `verified: "14.369"` (version is `0.3.1` at 28ccc87; `cssPrefix: "pa-"` also clears the re-run's C37 `.chat-message .pa-status`) | — | aoe W7 |
| transform | full · `transform` · `ptf-` | `compatibility.minimum: "14"` (-24); `esmodules` stays `["transform.mjs", "hud.mjs"]` (-9 superseded) | `NS/CSS/FLAG_SCOPE` pins | transform step 12 |
| combat | full · `combat` · `pc-` | `compatibility.verified: "14.369"` (unchanged at 28ccc87; the re-run only bumped `version`, now `0.2.4`) | — | combat S15 |

## Appended by Record steps

A guide's Record step adds a row here for any `module.json` edit not listed above (date, module,
edit, source step). Keep one row per edit.

| Date | Module | Edit | Source |
|---|---|---|---|
| 2026-10-11 | walls | `description`: `See playbooks/foundry-wall-autocomplete.md` → `See context/foundry/walls.md` (the use-doc, guide step 9; supersedes the wave-1 target `context/plans/foundry-wall-autocomplete.md`); `verified byte-identical against the same 44 fixtures` → `produces identical geometry, verified against the same fixture corpus` (the setting hint's wording, `test/fixtures/lang-en.wave7.json`) | senses-walls-cursors-8 (wave 1 integration; amended by walls wave 2) |

## Batch checklist

1. Every Stage 1–2 guide whose module is in batch 1 is `status: done` (or its row is removed here).
2. Scratch check: apply every row to a copy, run `conformance.py --module <m>` per module — C02, C07
   (and C04/C09/C38 where listed) pass.
3. One sync of all touched modules, **one** Foundry restart, then per module the live smoke (use-doc
   §6): `describe().version`, every described path a function, and (full tier) `inspect`, `selftest`.
4. Walls: run the migration on a copy of a stamped scene first; then live; `undo()` still peels back.
5. Fill each guide's Result row "`module.json` edits appended" and the date here.
