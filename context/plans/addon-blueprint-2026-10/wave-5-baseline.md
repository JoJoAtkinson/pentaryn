---
title: Addon blueprint — wave 5 baseline and batch item list
status: plan
last_modified: 2026-10-12
tags: [foundry, modules, blueprint, plan, migration, wave5]
---

# Wave 5 baseline (lane W5c, code only)

**Read this when:** you are working the wave 5 / Wave 7 restart batch on `migrate/wave-5`, or want to
know what the batch contained and where each item came from. Rules: `context/plans/overnight-2026-10-11.md`
§2, §9, §10. Batch rows: [`wave7-restart-batch.md`](wave7-restart-batch.md). Sources: the wave 2/3/4 reports'
"Open for Joe" and "What wave N starts with".

Base: `origin/main` at `7b444c6f`, tag `wave-5-base`, worktree `/Users/joe/Documents/GitHub/pentaryn-wave5-wt`.
Another code lane (`fix/overnight-2-2026-10-12`, worktree `pentaryn-fx2-wt`: senses SE4, attunement A1/A2) runs
at the same time: do not edit senses' `paint()`/chain code or attunement's bond/stash code; their
`module.json`/lang/style edits are this lane's. Forbidden files: `cloud.py storage.py bundles.py boot.py
bootstate.py uploadq.py`. Walls stays OFF in the world: prepare its `module.json`/lang edits, but its
flag-scope DATA migration must not run (record it).

## Baseline (before any wave 5 commit)

| Gate | Result |
|---|---|
| `pytest -q` | 1523 passed, 2 skipped, 6 xfailed |
| `make foundry-modules-check` (parse, imports, i18n, node tests, kit, conformance, all 20 modules) | "all 20 modules pass their gates"; one tolerated warning: walls `docs.test.mjs` "module.json cites a doc that exists" (the description edit is a batch row) |
| Kit | `foundry/lib/kit.json` 1.0.2; every module's vendored kit identical to `foundry/lib` |
| Stage 5 step 1 (drop `publish.mjs` frozen-root guard and re-alias tick) | **already done** in kit 1.0.2 (J10); `publish.mjs` header says so. W2-K1's per-module guard copies are the only leftovers, and a `vendor.py sync --all` after the kit bump re-vendors them |

Conformance (`module-conformance --json`; failing fail-class rules):

| Module | Score | Failing |
|---|---|---|
| aoe | 93.9 | C07 C09 C37 |
| attunement | 91.1 | C04 C07 C09 C62 |
| combat | 93.9 | C07 C21 C23 |
| creatures | 93.9 | C07 C09 C37 |
| cursors | 91.5 | C05 C13 C24 C25 (not in the batch) |
| dropbin | 93.9 | C07 C09 C50 |
| feedback | 100 | none |
| importer | 97.7 | C07 |
| journal | 87.8 | C03 C07 C09 C37 C51 C56 |
| lookup | 97.7 | C07 |
| movement | 95.8 | C07 C37 |
| names | 100 | none |
| pings | 100 | none |
| portals | 91.5 | C07 C09 C37 C51 |
| prompts | 98.0 | C07 |
| riders | 91.8 | C07 C09 C37 C56 |
| senses | 93.8 | C07 C09 C37 |
| ties | 92.0 | C05 C07 C09 C37 |
| transform | 95.8 | C07 C37 |
| walls | 95.7 | C07 C51 |

## Already landed on main (no batch work left)

cursors (all rows), names (`flags`, minimum 14), pings (`flags`, minimum 14, `lang/en.json` and `languages`
are present: re-check the pings row's "still open" `max` pin before touching it), feedback (new module,
complete). movement/journal `styles/` moves, attunement/portals `languages`, and every `afterSync` tuple except
cursors/names/pings/feedback are NOT landed (below).

## Decisions (Joe 2026-10-12: "They all look minor", take the recommendations)

Approve every Open-for-Joe default in the wave 2/3/4 reports. In this lane:

| Decision | Treatment |
|---|---|
| W2-B3, W2-B4, C62 attunement, W2-WALLS-1/3, W2-J1, W2-J2, W4-R6/T3, W4-C6/T4, W4-R5/R9, W4-I1 | build, see the items below |
| W2-MOV-1, W2-B1 (pointer to P7) | **closed**, no code |
| W3-SE1, W3-T5, W4-C4 | **deferred** |
| Everything else | default applies, "Decided" column gets "Joe 2026-10-12: <decision> — no change" |

Each is recorded in its report's Decided column as `Joe 2026-10-12: <decision> — <sha or 'no change'>`.

## Batch item list

Common to every `module.json` row (wave7-restart-batch.md): `flags.pentaryn` { tier, namespace, flagScope, cssPrefix,
generation 14, afterSync }, the `after_sync` tuple deleted from `scripts/foundry/ops/config.py` in the same commit,
`compatibility` `{ minimum: "14", verified: "14.369" }`. A `version` bump moves the core `VERSION` constant in the same commit.

### A. Kit (one bump, kit 1.0.2 to 1.1.0, then `vendor.py sync --all`)

| # | Edit | Source row |
|---|---|---|
| K1 | Row field `dryRun: true` in the `ApiRow` typedef and `describe()` (`foundry/lib/api.mjs`); importer's `import` row sets it; fork's pentaryn-write already honours `row.dryRun === true` | W2-B3 |
| K2 | Param marker for params that resolve strings themselves (`resolve: "self"`): `api.mjs` must treat it as "do not resolve" (same as `false`), `describe()` emits it; `conformance.py` C62 accepts it; `names.sync`'s `ref` uses it (names `describe` golden edit, `NS` unaffected). Fork follow-up if `pentaryn-call.ts` `needsDoc` does not honour it: **record, do not build the fork here** | W2-B4 |
| K3 | Kit docs (`foundry/lib/README.md`, blueprint 5.1a `params`) and `kit.json` version, kit tests | K1, K2 |

### B. Per-module `module.json` + code (rows from wave7-restart-batch.md)

| Module | Edit | Source row |
|---|---|---|
| importer | `flags.pentaryn` merged into the existing object (tier full, namespace `importer`, cssPrefix `pim-`, flagScope per D5); minimum 14; glue-test module-flags stub gains keys; K1 row field | importer step 9, W2-B3 |
| lookup | tier full, namespace `rules`, cssPrefix `plk-`, flagScope; minimum 13 to 14; afterSync | lookup W1 |
| movement | tier full, ns `movement`, `pm-`, flagScope `pentaryn-movement`; `git mv movement.css styles/movement.css` + `styles`; verified 14.369; afterSync (3 lines) | movement 5 |
| walls | `languages` en; `git mv test/fixtures/lang-en.wave7.json lang/en.json`; rows/keybindings to full-key literals (W2-WALLS-1, with the one frozen glue pin edit, [declared]); toasts to `log.notify` (W2-WALLS-3, pin edits with it); description fix (-8, `See context/foundry/walls.md`, and the `docs.test.mjs` expectation); minimum 14, verified 14.369; flags tier full ns `walls` `pw-`. **Flag-scope DATA migration (`wall-autocomplete` to `pentaryn-walls`, `migrations.mjs`, `migrateFlagScope`) must NOT run: walls stays OFF. Prepare nothing that runs; record that `flagScope` stays `wall-autocomplete` in the world and the migration is parked** | walls step 10, W2-WALLS-1/3, Joe 2026-10-12 |
| attunement | flags; `relationships.recommends` item-piles + reason; minimum 14; `styles/attunement.css` (move); `languages` + `lang/en.json` (C04); `stash`/`releaseAway` params marked eval-js only (row `doc` says `eval-js only`, golden `describe.json` regenerated) to clear C62. Do not edit bond/stash code | attunement step 9, C62, W2-A2 (default keep) |
| journal | flags; `relationships.systems` dnd5e (min 6.0, verified 6.0.6); recommends item-piles; `git mv journal.css styles/journal.css` + `styles`; README Files table; `PENTARYN_JOURNAL.settings.folderName.{name,hint}` + the one `settings-register.json` pin flip ([declared]) for C51 (W2-J1); W2-J2 `ensureOwn` row **only if the kit forwards the sender, else keep the hand-wired `relayed`** (kit K1-K3 does not add sender forwarding, so J2 stays: no change) | journal step 9, W2-J1/J2 |
| dropbin | flags; recommends item-piles and itempilesdnd5e; minimum 14; VERSION pin unaffected unless bumped | dropbin step 11 |
| prompts | flags tier full ns `prompts` `pp-` (flagScope already set); afterSync (incl. `selftest()`) | prompts W1 |
| ties | flags (flagScope `pentaryn-ties`, manifest-only); minimum 14, verified 14.369; recommends item-piles, dice-so-nice; afterSync. Version stays 0.19.4 unless released | ties S14 |
| creatures | flags `pcr-`, flagScope `pentaryn-creatures`; recommends keep lib-wrapper + item-piles + enhancedcombathud; `git mv creatures.css styles/`; verified 14.369; afterSync | creatures step 10 |
| portals | flags `ppt-`, flagScope `pentaryn-portals`; `git mv portals.css styles/`; recommends item-piles; `languages` + `lang/en.json` + `_loc` full-key literals + settings keys; replace `test/i18n.test.mjs` with lang-key pins; version bump moves `VERSION` and the frozen "0.4.4" pin; afterSync | portals W7, C51 |
| senses | flags `ps-`, flagScope `pentaryn-senses` (metadata only); minimum 14; recommends enhancedcombathud; afterSync (5 lines). No code in `paint()`/chain | senses step 13 |
| riders | flags `pr-`; recommends enhancedcombathud + enhancedcombathud-dnd5e; `git mv riders.css styles/riders.css` + `styles` (and the `argon-tooltip-click-through` adjustments row `files` follows); verified 14.369; **version 0.3.0 with `VERSION` (W4-R6)**; afterSync; **D7 vendor (W4-R5/R9): `vendor.py sync pentaryn-riders --kit argon-tooltip`, list `lib/argon-tooltip.css` in `styles`, keep the `#tooltip` click-through rule in riders.css** (C37 stays failing on it: a documented exception) | riders S10, W4-R5/R6/R9 |
| aoe | flags `pa-`; recommends enhancedcombathud + item-piles; `git mv aoe.css styles/`; verified 14.369; **version 0.4.0 with core `VERSION`**; afterSync | aoe W7, W4-R6 (version bumps row) |
| transform | flags `ptf-`; minimum 14; **version 0.4.0 with `VERSION`**; flip `core.test` "manifest today" pin [declared]; afterSync; **W4-T4: `styles: ["styles/transform.css", "lib/argon-tooltip.css"]`, drop `@import "../lib/argon-tooltip.css"` from `styles/transform.css` and flip the D7 import pin in `test/css.test.mjs`, same commit** | transform step 12, W4-T3/T4 |
| combat | flags `pc-`; verified 14.369; **version 0.3.0 with `VERSION`**; flip literal "0.2.5" pin in `core.test.mjs` [declared]; `description` sentence (combat-riders-15, from the wave-4 report); **W4-C6: load `lib/argon-tooltip.css` via `styles`, drop combat's `styles/combat.css` `@import`, flip its pin** | combat S15, W4-C6 |

### C. Docs

| # | Edit | Source row |
|---|---|---|
| D1 | `context/foundry/argon.md`: every Argon hook and prototype touch, by module and order (combat, riders, transform, creatures, senses, aoe ...), a read-this-when line, and a pointer from `context/foundry/README.md`. Docs commit before the restart's live smoke | W4-I1 |
| D2 | Decided column in the wave 2/3/4 reports (`Joe 2026-10-12: ... — <sha|no change>`) for every Open-for-Joe row; wave7-restart-batch.md row status; README Stage 3/5 notes | Joe 2026-10-12 |
| D3 | Follow-ups recorded, not built: fork follow-up for K2 (if needed), W3-PR4 and W4-L3 (fork lane), W3-SE1 / W3-T5 / W4-C4 deferred | decisions |

### D. Strict gates (batch checklist step 2, README Stage 5 step 2)

Apply every row, then per module `module-check` and conformance. Expected (wave 4 report): aoe 48/48, transform 100 %;
documented exceptions after the batch: riders C37 (two `#tooltip` selectors, W4-R9) and C56 (W4-R4, keep until the kit
forwards the sender), combat C21/C23 (W4-C3). Also expected still red: cursors C05/C13/C24/C25, ties C05/C37, journal
C56, dropbin C50. Do not turn the gate from advisory to failing in this lane unless the exceptions are listed as such.

## Order of work

1. Kit bump (K1-K3) and `vendor.py sync --all`.
2. Per-module batch commits (B), one commit per module with `-- <paths>`, `[declared]` where a pin flips.
3. D7 wiring (riders, transform, combat).
4. `argon.md` (D1).
5. Decided columns (D2), re-run the baseline gates, push `migrate/wave-5`, write the wave 5 live plan.
