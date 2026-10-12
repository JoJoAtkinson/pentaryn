---
title: Addon blueprint — Wave 7 restart batch (module.json edits, consolidated)
status: plan
last_modified: 2026-10-12
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
| prompts | full · `prompts` · `pp-` (`flagScope: "pentaryn-prompts"`, `generation: 14` already present; add `tier`, `namespace`, `cssPrefix`, `afterSync`) | — (`minimum: "14"`, `verified: "14.369"`, `styles`, `languages` and both `recommends` are already in) | `afterSync` = the prompts ModuleSpec tuple verbatim (it gained `game.pentaryn.prompts.selftest()` in wave 3, `bc344835`), deleted from `config.py` in the same commit. A `version` bump moves `VERSION` in `prompts-core.mjs` in the same commit (a test pins them equal) | prompts W1; wave 3 lane (C07 the only rule left: 97.9 % on a copy with the adjustments rows, now landed) |
| ties | full · `ties` · `pt-`; `flagScope: "pentaryn-ties"` (today `"ties"`; manifest-only, the code writes `flags.pentaryn-ties`) | `compatibility: { minimum: "14", verified: "14.369" }`; `recommends` item-piles (reason: "double-click look menu skips item-pile tokens; inspect preview excludes pile actors") and dice-so-nice (reason: "blind study rolls set flags.dice-so-nice.skip") | `afterSync` = the ties ModuleSpec tuple, deleted from `config.py`. Version is still 0.19.4 with an "Unreleased" CHANGELOG and API rows marked "since 0.20.0": bump `module.json` and `ties-core.mjs` `VERSION` together at release | ties S14; wave 3 lane (96.0 % on a copy; C05 scorer gap and C37 card layer left) |

## Batch 2 — Wave 7b (WAIT modules), or fold into batch 1 if Joe lifts them first

| Module | `flags.pentaryn` (tier · namespace · cssPrefix) | Other `module.json` edits | Code in the same batch | Source |
|---|---|---|---|---|
| creatures | full · `creatures` · `pcr-`; `flagScope: "pentaryn-creatures"` (today `"creatures"`; manifest-only) | `recommends` (keep lib-wrapper) + `{id: "item-piles", type: "module", reason: "Item Piles piles are left out of the light and the strip."}` and `{id: "enhancedcombathud", type: "module", reason: "The strip floats above Argon's Combat HUD while it is open (setting floatOverHud)."}`; `styles: ["styles/creatures.css"]` + `git mv creatures.css styles/creatures.css`; `verified: "14.369"` | `afterSync` = the creatures ModuleSpec tuple verbatim, deleted from `config.py` in the same commit. The `NS/CSS/FLAG_SCOPE` manifest pins already exist (`84d52ee4`) and skip until these flags land — they turn on by themselves | creatures step 10; wave 3 lane (100 % on a copy with these and the adjustments rows) |
| portals | full · `portals` · `ppt-`; `flagScope: "pentaryn-portals"` (today `"portals"`; manifest-only, the code already writes `flags.pentaryn-portals`) | `styles: ["styles/portals.css"]` + `git mv portals.css styles/portals.css`; `recommends` item-piles + reason; `languages` | `afterSync` = the portals ModuleSpec tuple, deleted from `config.py` in the same commit. **i18n (-29)**: `lang/en.json`, `_loc` full-key literals, settings keys (three rows since the re-run, plus the `plainQuestion` and party-confirm strings) — never before `languages` is live; the W7 commit replaces `test/i18n.test.mjs` (written to fail once `languages` exists) with the lang-key pins. A `version` bump moves `VERSION` in `portals-core.mjs` **and** the frozen `core.test` "version as shipped (0.4.4)" pin in the same commit | portals W7; wave 3 lane |
| senses | full · `senses` · `ps-`; `flagScope: "pentaryn-senses"` (today `"senses"`; metadata only, no data migration) | `minimum: "14"`; `recommends: [{ id: "enhancedcombathud", type: "module", reason: "Light's Pick a target closes open Combat HUD panels first (argon.mjs)" }]` | `afterSync` = the five lines of the senses ModuleSpec tuple, deleted from `config.py` in the same commit. `ps-` clears C37 with no CSS edit | senses step 13; wave 3 lane |
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
| 2026-10-12 | riders | `flags.pentaryn = { tier: "full", namespace: "riders", flagScope: "pentaryn-riders", cssPrefix: "pr-", generation: 14, afterSync }` (afterSync from the config.py tuple, which the same commit deletes); `relationships.recommends` enhancedcombathud + enhancedcombathud-dnd5e (guide S10 reasons); `git mv riders.css styles/riders.css` + `styles: ["styles/riders.css"]` (the `argon-tooltip-click-through` adjustments row's `files` follows the move in the same commit); `compatibility.verified: "14.369"`; `version: "0.3.0"` with `riders-core.mjs` `VERSION = "0.3.0"` (constants.test pins them equal, W4-R6). **D7 after the recommends edit:** `vendor.py sync pentaryn-riders --kit argon-tooltip`, and list `lib/argon-tooltip.css` in `styles` or `@import` it from `styles/riders.css` (inert for riders alone) | riders migration lane + standalone lane + D7 (wave-4 report) |
| 2026-10-12 | aoe | `flags.pentaryn = { tier: "full", namespace: "aoe", flagScope: "pentaryn-aoe", cssPrefix: "pa-", generation: 14, afterSync }` (tuple moved, deleted from config.py); `recommends` enhancedcombathud + item-piles (reasons); `git mv aoe.css styles/aoe.css` + `styles: ["styles/aoe.css"]`; `compatibility.verified: "14.369"`; `version: "0.4.0"` with `core.mjs` `VERSION = "0.4.0"` in the same commit (two tests pin them equal; the API rows already say `since: "0.4.0"`). Clears C07, C09, C37 | aoe migration lane |
| 2026-10-12 | transform | `flags.pentaryn = { tier: "full", namespace: "transform", flagScope: "pentaryn-transform", cssPrefix: "ptf-", generation: 14, afterSync: ["After a sync: reload every client (a module.json change needs a Foundry restart).", "  game.pentaryn.transform.describe()   game.pentaryn.transform.selftest()   game.pentaryn.transform.inspect(\"Talo\")"] }` (and delete config.py's transform tuple, made version-neutral in `fb3361b9`); `compatibility.minimum: "14"` (-24); `version: "0.4.0"` with `transform-core.mjs` `VERSION = "0.4.0"`; `esmodules` stays `["transform.mjs", "hud.mjs"]`; flip transform's `core.test` "manifest today" pin (0.3.3, minimum 13, flagScope `transform`) **[declared]** in the same commit. Optional (W4-T4): `styles: ["styles/transform.css", "lib/argon-tooltip.css"]`, drop the `@import` line and flip the D7 import pin in `test/css.test.mjs` | transform migration lane + D7 |
| 2026-10-12 | combat | `flags.pentaryn = { tier: "full", namespace: "combat", flagScope: "pentaryn-combat", cssPrefix: "pc-", generation: 14, afterSync }` (the config.py tuple, already pointing at "README → Settings" since `fb3361b9`; delete it from config.py); `compatibility.verified: "14.369"`; `version: "0.3.0"` with `combat-core.mjs` `VERSION = "0.3.0"` and the literal "0.2.5" pin in `test/core.test.mjs` flipped **[declared]** in the same commit; `description`: insert before " Every change is a setting." the turn-flow sentence from the wave-4 report "Integrator — combat (review)" (combat-riders-15). D7 (W4-C6): combat already loads the kit stylesheet through `styles/combat.css`'s `@import` (`24e961a0`); listing `lib/argon-tooltip.css` in `styles` is optional and then drops that `@import` and flips its pin | combat migration lane + review + D7 |

## Applied on `migrate/wave-5` (lane W5c, code only, 2026-10-12)

Every row above, one commit per module, on top of kit 1.1.0 (`a9ce0b18`, re-vendored per module).
Decided column: Joe 2026-10-12 ("They all look minor" — take the recommendations). Nothing is synced
or restarted yet: the batch checklist below (sync, **one** restart, live smoke) is the live lane's.

| Module | Commit | Decided / note | Conformance after |
|---|---|---|---|
| importer | `d3d9cb29` | Joe 2026-10-12: merged into the existing `flags.pentaryn`; `import` row `dryRun: true` (W2-B3) — `d3d9cb29` | 100 % |
| names | `5835ac59` | Joe 2026-10-12: `sync`'s `ref` `resolve: "self"` (W2-B4) — `5835ac59`; manifest landed earlier | 100 % |
| pings, cursors | — | landed earlier (wave 1). The pings "still open" `max` pin is done: `languages` + `lang/en.json` are on main. Their duplicate config.py tuples dropped (`8037e674`) | 100 % / 91.5 % (cursors C05/C13/C24/C25, not in the batch) |
| lookup | `dbd8c58a` | Joe 2026-10-12: as the row — `dbd8c58a` | 100 % |
| movement | `28e73b21` | Joe 2026-10-12: as the row — `28e73b21` | 100 % |
| walls | `320879a2` | Joe 2026-10-12: `languages`, lang keys (W2-WALLS-1), toasts through `log.notify` (W2-WALLS-3), description, minimum/verified, flags — `320879a2`. **The flag-scope DATA migration is PARKED, not wired, not run**: walls stays off in Joe's world, so `flagScope` stays `wall-autocomplete` in `module.json` and `core/engine.mjs`, `migrations.mjs` stays dormant, and the frozen `test/core.test.mjs` FLAG_SCOPE pin is untouched. Run it (this row's "Code in the same batch" column) only when Joe turns walls back on | 98.0 % (C07: flagScope, the parked migration) |
| attunement | `a7e1395b` | Joe 2026-10-12: as the row; `stash`/`releaseAway` docs say eval-js only (C62). `lang/en.json` is INERT (STRINGS verbatim): the `_loc` switch (guide step 8, declared) touches `bonds.mjs`, the fx2 lane's bond code, so it waits — a reload then, no restart, since `languages` is already in | 97.9 % (C35 until step 8) |
| journal | `08ac3c3d` | Joe 2026-10-12: as the row + W2-J1 `folderName` labels ([declared] pin) — `08ac3c3d`; W2-J2 not taken (kit does not forward the sender) | 98.0 % (C56) |
| dropbin | `61b65058` | Joe 2026-10-12: as the row; version unchanged — `61b65058` | 98.0 % (C50) |
| prompts | `4b9d5e49` | Joe 2026-10-12: as the row — `4b9d5e49` | 100 % |
| ties | `11149c59` | Joe 2026-10-12: as the row; version stays 0.19.4 — `11149c59` | 96.1 % (C05 W3-T6, C37 W3-T1) |
| creatures | `ba10619e` | Joe 2026-10-12: as the row — `ba10619e` | 100 % |
| portals | `2ce4a806` | Joe 2026-10-12: as the row + i18n (-29, [declared] D-P2), version 0.4.4 → 0.5.0 with `VERSION` and the frozen pin — `2ce4a806` | 100 % |
| senses | `0c7036e8` | Joe 2026-10-12: manifest only, no `paint()`/chain code — `0c7036e8` | 100 % |
| riders | `33e22823` | Joe 2026-10-12: as the row, 0.3.0 (W4-R6), D7 vendor + `styles` (W4-R5), `#tooltip` rule kept (W4-R9) — `33e22823` | 96.0 % (C37 `#tooltip` ×2, C56) |
| aoe | `36573303` | Joe 2026-10-12: as the row, 0.4.0 — `36573303` | 100 % |
| transform | `fb707298` | Joe 2026-10-12: as the row, 0.4.0 (W4-T3), kit CSS through `styles` (W4-T4) — `fb707298` | 100 % |
| combat | `249b5cd1` | Joe 2026-10-12: as the row, 0.3.0, description sentence, kit CSS through `styles` (W4-C6) — `249b5cd1` | 96.0 % (C21/C23 W4-C3) |

**Strict-gate exceptions (documented, the gate stays advisory in this lane):** riders C37 (two
`#tooltip` selectors, W4-R9) and C56 (W4-R4), combat C21/C23 (W4-C3), journal C56 (W2-J2), dropbin
C50, ties C05/C37 (W3-T6/W3-T1), cursors C05/C13/C24/C25, walls C07 (the parked migration) and
attunement C35 (until its `_loc` step).

**Follow-ups recorded, not built:**

- Fork (K2): `pentaryn-call.ts` `needsDoc` treats any first `ref` whose `resolve !== false` as
  kit-resolved, so `resolve: "self"` on `names.sync` already passes. A **non-first** param carrying
  the marker is still refused; the follow-up is one line (`if (p?.resolve === 'self') return false;`)
  plus its vitest, and the fork's doc comment naming names.sync as refused is stale. Its
  `takesDryRun` already honours `row.dryRun === true` (K1).
- Fork lane: W3-PR4 (the fork halves of mcp-fork-15 and prompts-lookup-11/-12) and W4-L3
  (pentaryn-read's description still calls four namespaces "eval-js only").
- Deferred by Joe: W3-SE1, W3-T5, W4-C4. Closed: W2-MOV-1, W2-B1 (pointer to P7).
- attunement guide step 8 (`_loc`, declared) after the fx2 lane's bond-code work merges.
- walls flag-scope DATA migration: parked until walls is back on (above).

## Batch checklist

1. Every Stage 1–2 guide whose module is in batch 1 is `status: done` (or its row is removed here).
2. Scratch check: apply every row to a copy, run `conformance.py --module <m>` per module — C02, C07
   (and C04/C09/C38 where listed) pass.
3. One sync of all touched modules, **one** Foundry restart, then per module the live smoke (use-doc
   §6): `describe().version`, every described path a function, and (full tier) `inspect`, `selftest`.
4. Walls: run the migration on a copy of a stamped scene first; then live; `undo()` still peels back.
5. Fill each guide's Result row "`module.json` edits appended" and the date here.
