---
title: Addon blueprint — migration order (2026-10 snapshot)
status: history
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, plan, migration]
---

# Migration order — bringing the 19 modules to the blueprint

> **Superseded by [README.md §3](README.md).** Kept as history; do not plan from it. Its WAIT
> column predates `scripts/foundry/blueprint/wait.json` (portals, creatures and senses are WAIT
> there), and its scores predate scorer fixes R2–R9.

**Read this when:** you want the design-time order the blueprint first proposed, as history — to plan
the fix phase, read [README.md](README.md) §3 instead. **Not this file:** how to migrate one module — that procedure is in
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8. The scores below are a
point-in-time snapshot ([`conformance-baseline.md`](conformance-baseline.md)); the fix phase works
from `conformance.py --markdown` run live, never from this table.

## Rules for every step

1. Characterisation lands first, in its own commit, committed by the agent (review happens at merge);
   the refactor commit never touches `test/golden/` or the characterisation tests.
2. **WAIT** modules are not touched while the live-test/melee workflow is running on them (the live
   list is `scripts/foundry/blueprint/wait.json`, printed by the scorer; it also holds creatures,
   portals and senses, which the live-test workflow was editing on 2026-10-10); when it lifts,
   re-anchor every finding against the live tree (`git diff <snapshot-sha>..HEAD --
   foundry/module/<m>`, then `conformance.py --module <m>`).
3. `module.json` edits (`flags.pentaryn`, `minimum → 14`, `styles/`, flag-scope fixes, pings/portals
   lang) are batched into the single **Wave 7 restart batch**, synced once.
4. `foundry/adjustments.yml` rows are appended in one batch while that file is idle.
5. Declared changes go to the live-test workflow before merge.

## Common failures (every module, expected)

C07 `flags.pentaryn` · C14 no vendored kit · C18 no install/uninstall features · C20/C27/C28 no
goldens or api-manifest · C40/C41/C43 test layout · C44/C45 README order, CHANGELOG. These are
the blueprint's new requirements; each module clears them during its own migration (C07 in the
Wave 7 batch).

## Order

| # | Module | Tier | Score | Module-specific failures | Why here / watch for |
|---|---|---|---|---|---|
| 0 | **kit + blueprint** | — | — | — | landed as new files (this workflow); pending wiring in the use-doc §12 |
| 1 | `pentaryn-importer` | full | 62.2 % | C11, C12, C25, C39 | **keystone** (items-journal-1): stop replacing/freezing `game.pentaryn`, so `publish.mjs`'s frozen-root guard and its `setTimeout 0` re-alias can later go. Declared: only the frozen-root behaviour changes; test publishes in both load orders |
| 2 | `pentaryn-names` | small | 64.1 % | C11, C12, C34, C39 | first **small**-tier proof: ~60 lines; needs a core file, a ModuleSpec with node-test; lang root rename is Wave 7 |
| 3 | `pentaryn-pings` | small | 60.5 % | C11, C21, C22, C32, C39 | small tier; its wraps need adjustments rows (C32); lang + README via Wave 7 |
| 4 | `pentaryn-cursors` | small | 53.7 % | C05, C13, C21, C22, C24, C25, C26, C34 | small tier; `tools/build.mjs` is a build script (move out of the module or list it as unreachable-by-design); DESIGN.md → `context/plans/` |
| 5 | `pentaryn-lookup` | full | 63.2 % | C12, C24, C48 | namespace stays `rules` (`flags.pentaryn.namespace`); C48 is `selftest` — check its return shape against `{ok, checks}` before letting the kit own the name |
| 6 | `pentaryn-walls` | full | 59.0 % | C11, C12, C21, C22, C24 | keeps GM-only publish after `await wasmReady` → `publishNamespace(…, {when: "ready:gm:wasm"})`; its check target stays `make foundry-walls-test` |
| 7 | `pentaryn-attunement` | full | 56.4 % | C04, C09, C11, C26, C29, C37 | needs `lang/` (restart batch), an `attunement-core.mjs` seam, `inspect`; Item Piles named in code → relationships + rows |
| 8 | `pentaryn-journal` | full | 48.8 % | C09, C12, C21, C22, C24, C26, C30, C37, C46, C47 | unguarded `CONFIG.queries` handler (C30) → manifest row `query: true`; needs a routing row |
| 9 | `pentaryn-portals` | full | 57.9 % | C09, C24, C26, C37, C47 | CSS prefix `pp-` collides with prompts → `ppt-` (declared, CSS-only); lang via Wave 7 |
| 10 | `pentaryn-movement` | full | 53.7 % | C03, C12, C21, C22, C24, C26, C35, C37 | dnd5e is named only in comments today (C03): decide whether `ignoreTokens` makes it a real dependency |
| 11 | `pentaryn-creatures` | full | 53.7 % | C09, C21, C22, C26, C32, C35, C37, C47 | libWrapper/hand wrap → `wrapMethod` keeping the marker literal |
| 12 | `pentaryn-dropbin` | full | 53.7 % | C09, C12, C17, C21, C22, C24, C35, C47 | socketlib + Item Piles rows; ledger store → `serialStore` (any-GM default) |
| 13 | `pentaryn-senses` | full | 48.8 % | C12, C13, C17, C21, C22, C24, C34, C35, C37, C48 | publishes `senses` and the `chain` alias (`alias: true`); C48 `uninstall` has the kit meaning already; DESIGN docs → `context/plans/` |
| 14 | `pentaryn-prompts` | full | 51.2 % | C15, C16, C21, C22, C24, C26, C32, C35, C47, C48 | queries characterised first (`golden/queries.json`, `cropsAs: "base64"` via `wire`); libWrapper route (`patch-libwrapper`, lib-wrapper in relationships); publishes after async ready (`when`); C48 `version` is the kit meaning |
| 15 | `pentaryn-ties` | full | 43.9 % | C09, C12, C15, C16, C21, C22, C24, C34, C35, C37, C39, C47, C48 | largest; ties-35 split behind barrels; **declared**: `describe` → `describeCard` ([plan](../addon-blueprint-2026-10.md) §9.8); ModuleSpec gains node-test |
| 16 | `pentaryn-riders` | full | 47.6 % | C09, C12, C17, C21, C22, C26, C29, C30, C32, C35, C37 | **WAIT** (melee workflow); Argon tidy-ups stay here; unguarded query handler |
| 17 | `pentaryn-aoe` | full | 50.0 % | C09, C16, C22, C24, C29, C32, C34, C35, C47, C48 | **WAIT** (in flux); keeps `guardSwallowAsync` until re-characterised; flag scope `aoe` → module id is a Wave 7 data migration; C48 `uninstall` has the kit meaning |
| 18 | `pentaryn-transform` | full | 48.8 % | C12, C13, C16, C17, C21, C23, C24, C29, C35, C37 | **WAIT**; `hud.mjs`/`starry.mjs` import the entry (C16); entry collapse needs the hook-order fixture; reads combat's settings (C23) → combat API |
| 19 | `pentaryn-combat` | full | 45.2 % | C12, C15, C17, C19, C21, C22, C23, C24, C26, C29, C32, C35 | **WAIT**, last; `pentarynCombat.*` events → `HOOKS` rows with `legacyName` + `until` (double-fire, declared); `argon-kit` written here first (Wave 8.6) |

Small tier for names, pings and cursors follows D16 (no persistent state, no API writes). Every
other module is full because it stores state, writes through its API, or has settings.

## After the last module

- Remove the frozen-root guard and the re-alias tick from `foundry/lib/publish.mjs` (once the
  importer change is live), bump the kit, re-vendor everywhere.
- Turn on the pending gate wiring (use-doc §12) so `make foundry-<m>-check` runs vendor and
  conformance itself.
- Consider the phase-2 `pentaryn-lib` library module ([plan](../addon-blueprint-2026-10.md) §9, decision 1) once every module
  conforms.
