---
title: Addon conformance baseline (the "before")
status: history
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, plan]
---

# Addon conformance baseline — frozen snapshot, 2026-10-10

**Read this when:** you want the before-picture of the 19 modules against the addon blueprint.
**Not this file:** the live work list — regenerate it with
`./.venv/bin/python scripts/foundry/blueprint/conformance.py --markdown` (or `--module <m>`). This
file is history; never operate from it.

Scored by `scripts/foundry/blueprint/conformance.py --snapshot` against the audit's frozen code
snapshot (pentaryn `ee505c2` plus the uncommitted changes of 2026-10-10 20:15 EDT; snapshot line
numbers). Repo-wiring rules (C39 ModuleSpec, C46 routing) were read from the live repo.

Average fail-class score: **53.8 %**. Every module fails C07 (no complete `flags.pentaryn`), C14
(no vendored kit), C18 (no install/uninstall features), C27/C28 (no api-manifest, no goldens) and
C44/C45 (README order, no CHANGELOG) — these are the blueprint's new requirements and are expected
to fail before migration. The module-specific failures are the useful part: C09/C47 (packages
named without relationships or adjustments rows), C17 (hooks at module scope outside the entry),
C21/C22 (settings outside a table), C24 (empty catches), C26 (publish timers), C48 (reserved API
names).

Heuristic notes: C16 classifies files by name and exports; files it cannot classify are listed as
"glue" and allowed anything but the entry/test. C03 and C09 read code with comments stripped, so a
dnd5e or package dependency mentioned only in a comment does not count. C36 counts capitalised
multi-word literals next to UI sinks. C36 and C49 are warn+manual: a hit is listed under Warnings and again
under Manual (the review list).

## Scores

| Module | Tier | Score | Failing (fail-class) | Warnings | Manual |
|---|---|---|---|---|---|
| `pentaryn-aoe` | full | 50.0 % (21/42) | C07, C09, C14, C16, C18, C20, C22, C24, C27, C28, C29, C32, C34, C35, C40, C41, C43, C44, C45, C47, C48 | C06w | C31 |
| `pentaryn-attunement` | full | 56.4 % (22/39) | C04, C07, C09, C11, C14, C18, C20, C26, C27, C28, C29, C37, C40, C41, C43, C44, C45 | C02, C06w, C10 | C31 |
| `pentaryn-combat` | full | 45.2 % (19/42) | C07, C12, C14, C15, C17, C18, C19, C20, C21, C22, C23, C24, C26, C27, C28, C29, C32, C35, C40, C41, C43, C44, C45 | C10, C36, C37w | C31, C33, C36 |
| `pentaryn-creatures` | full | 53.7 % (22/41) | C07, C09, C14, C18, C20, C21, C22, C26, C27, C28, C32, C35, C37, C40, C41, C43, C44, C45, C47 | C06w, C10 | C31 |
| `pentaryn-cursors` | full | 53.7 % (22/41) | C05, C07, C13, C14, C18, C20, C21, C22, C24, C25, C26, C27, C28, C34, C40, C41, C43, C44, C45 | C02, C10 | C31 |
| `pentaryn-dropbin` | full | 53.7 % (22/41) | C07, C09, C12, C14, C17, C18, C20, C21, C22, C24, C27, C28, C35, C40, C41, C43, C44, C45, C47 | C02, C10, C36 | C31, C36 |
| `pentaryn-importer` | full | 62.2 % (23/37) | C07, C11, C12, C14, C18, C20, C25, C27, C28, C39, C40, C41, C44, C45 | C02, C10, C36 | C31, C36 |
| `pentaryn-journal` | full | 48.8 % (20/41) | C07, C09, C12, C14, C18, C20, C21, C22, C24, C26, C27, C28, C30, C37, C40, C41, C43, C44, C45, C46, C47 | C06w, C10 | C31 |
| `pentaryn-lookup` | full | 63.2 % (24/38) | C07, C12, C14, C18, C20, C24, C27, C28, C40, C41, C43, C44, C45, C48 | C02, C10 | C31 |
| `pentaryn-movement` | full | 53.7 % (22/41) | C03, C07, C12, C14, C18, C20, C21, C22, C24, C26, C27, C28, C35, C37, C40, C41, C43, C44, C45 | C06w, C10 | C31 |
| `pentaryn-names` | full | 64.1 % (25/39) | C07, C11, C12, C14, C18, C20, C27, C28, C34, C39, C40, C41, C44, C45 | C02 | C31 |
| `pentaryn-pings` | full | 60.5 % (23/38) | C07, C11, C14, C18, C20, C21, C22, C27, C28, C32, C39, C40, C41, C44, C45 | C02, C10, C36 | C31, C36 |
| `pentaryn-portals` | full | 57.9 % (22/38) | C07, C09, C14, C18, C20, C24, C26, C27, C28, C37, C40, C41, C43, C44, C45, C47 | C06w, C10, C36 | C31, C36 |
| `pentaryn-prompts` | full | 51.2 % (21/41) | C07, C14, C15, C16, C18, C20, C21, C22, C24, C26, C27, C28, C32, C35, C40, C43, C44, C45, C47, C48 | C10 | C31, C33 |
| `pentaryn-riders` | full | 47.6 % (20/42) | C07, C09, C12, C14, C17, C18, C20, C21, C22, C26, C27, C28, C29, C30, C32, C35, C37, C40, C41, C43, C44, C45 | C06w, C10, C36 | C31, C33, C36 |
| `pentaryn-senses` | full | 48.8 % (20/41) | C07, C12, C13, C14, C17, C18, C20, C21, C22, C24, C27, C28, C34, C35, C37, C40, C41, C43, C44, C45, C48 | C02, C10, C36, C37w | C31, C36 |
| `pentaryn-ties` | full | 43.9 % (18/41) | C07, C09, C12, C14, C15, C16, C18, C20, C21, C22, C24, C27, C28, C34, C35, C37, C39, C40, C41, C44, C45, C47, C48 | C02, C10, C36 | C31, C33, C36 |
| `pentaryn-transform` | full | 48.8 % (20/41) | C07, C12, C13, C14, C16, C17, C18, C20, C21, C23, C24, C27, C28, C29, C35, C37, C40, C41, C43, C44, C45 | C02, C10, C37w, C49 | C31, C33, C49 |
| `pentaryn-walls` | full | 59.0 % (23/39) | C07, C11, C12, C14, C18, C20, C21, C22, C24, C27, C28, C40, C41, C43, C44, C45 | C02, C10, C36 | C31, C36 |

## Top failing rules

| Rule | Modules failing | What it checks |
|---|---|---|
| C07 | 19 | flags.pentaryn has tier, namespace, flagScope == id, cssPrefix, generation |
| C14 | 19 | lib/kit.lock.json present and vendor.py check passes |
| C18 | 19 | every feature file exports install and uninstall |
| C20 | 19 | test/golden/hooks.json exists |
| C27 | 19 | api-manifest.mjs exists and buildApi is used |
| C28 | 19 | golden describe.json and surface.json present |
| C40 | 19 | the tier's required test files are present |
| C44 | 19 | README sections in order; Pitfalls and Extending present; no fixture counts |
| C45 | 19 | CHANGELOG.md exists |
| C41 | 18 | a test pins VERSION === module.json version |
| C43 | 15 | test/run.mjs is the fixed body; self-running suites are listed in LEGACY |
| C21 | 13 | game.settings.register|get only in settings.mjs or lib/ |
| C22 | 13 | SETTINGS exported when any setting is registered |
| C24 | 13 | no empty or comment-only catch |
| C12 | 12 | MODULE defined once; no MOD / MODULE_ID / SCOPE |
| C35 | 10 | no two-branch i18n wrapper; definite key coverage ≥ 90 % |
| C26 | 9 | no setTimeout(…, 0) around publish outside lib/; no setTimeout ≥ 100 ms for readiness |
| C37 | 9 | every CSS selector under .pentaryn-<short> or .<cssPrefix> |
| C09 | 8 | recommends carry reasons; every package named in code is in relationships |
| C47 | 7 | adjustments rows exist for every package the code names |
| C32 | 6 | prototype patches only via wrapMethod/defineAccessor; rows ↔ patches agree |
| C11 | 5 | a pure core exists: no game/canvas/ui/Hooks/CONFIG, only foundry.utils |
| C17 | 5 | module-scope Hooks.on/once only in the entry |
| C29 | 5 | inspect() present when the module writes flags on actors/tokens |
| C34 | 5 | lang/en.json nested with one root PENTARYN_<SHORT> |
| C48 | 5 | no reserved API name reused by a non-kit member |
| C16 | 4 | import direction (§1) less test/graph-allow.json; nothing imports the entry or test/ |
| C39 | 4 | test/run.mjs exists; the ModuleSpec runs node-test |
| C13 | 3 | no .md in the module other than README / CHANGELOG |
| C15 | 3 | `import * as` only for feature files (from the entry) and core/ barrels |
| C23 | 2 | never reads another pentaryn module's settings |
| C25 | 2 | every console.* line carries the `<module> |` prefix (or the file logs through makeLog) |
| C30 | 2 | queries registered only through guarded / registerQueries |
| C03 | 1 | dnd5e in relationships.systems iff the sources touch dnd5e |
| C04 | 1 | languages present iff any i18n key literal or call |
| C05 | 1 | every non-test, non-lib .mjs reachable from esmodules |
| C19 | 1 | emitted hook names are pentaryn-<short>.* or a HOOKS legacyName |
| C46 | 1 | a use-doc or a route in context/foundry/README.md |

## Per-module detail

#### `pentaryn-aoe` — 50.0 %

- **C06w** warn: move to styles/ in Wave 7: aoe.css
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'aoe' ≠ 'pentaryn-aoe' (Wave 7 data migration, not blessed)
- **C09** fail: code names enhancedcombathud (areas.mjs) but relationships do not; code names item-piles (resolve.mjs) but relationships do not
- **C14** fail: pentaryn-aoe: no lib/kit.lock.json — run vendor.py sync pentaryn-aoe
- **C16** fail: tray.mjs (ui) → hooks.mjs (glue); tray.mjs (ui) → resolve.mjs (glue); unclassified (glue): areas.mjs, attacks.mjs, effects.mjs, escape.mjs, hooks.mjs, resolve.mjs
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C22** fail: settings are registered but no file exports SETTINGS
- **C24** fail: areas.mjs:434; resolve.mjs:59
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C29** fail: writes flags but publishes no inspect(ref)
- **C32** fail: row aoe-argon-handle-bind has no wrapMethod patch naming it; row aoe-core-region-delete-update-race (**renamed `core-region-delete-handle-race`**, D2 `df661e0`) has no wrapMethod patch naming it
- **C34** fail: top-level keys ['PENTARYN_AOE.RemoveAllTemplates', 'PENTARYN_AOE.NoArea', 'PENTARYN_AOE.CannotRemove', 'PENTARYN_AOE.Effects.Unapplied']…; want ['PENTARYN_AOE']
- **C35** fail: definite coverage 13% (7/54)
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 5 more
- **C45** fail: no CHANGELOG.md
- **C47** fail: no adjustments row for item-piles with modules: [pentaryn-aoe]
- **C48** fail: aoe.mjs:43 `uninstall`

#### `pentaryn-attunement` — 56.4 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C04** fail: i18n used in attunement.mjs but no languages
- **C06w** warn: move to styles/ in Wave 7: attunement.css
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'attunement' ≠ 'pentaryn-attunement' (Wave 7 data migration, not blessed)
- **C09** fail: code names item-piles (attunement.mjs) but relationships do not
- **C10** warn: attunement.mjs 901/150
- **C11** fail: no *-core.mjs / core.mjs
- **C14** fail: pentaryn-attunement: no lib/kit.lock.json — run vendor.py sync pentaryn-attunement
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C26** fail: attunement.mjs:866 setTimeout 0 around publish
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C29** fail: writes flags but publishes no inspect(ref)
- **C37** fail: attunement.css: .dnd5e2.sheet.actor .attunement.pentaryn-over-cap; attunement.css: .dnd5e2.sheet.actor .attunement.pentaryn-over-cap .value; attunement.css: .pentaryn-away-tip; attunement.css: .pentaryn-away-tip p
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 5 more
- **C45** fail: no CHANGELOG.md

#### `pentaryn-combat` — 45.2 %

- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'combat' ≠ 'pentaryn-combat' (Wave 7 data migration, not blessed)
- **C10** warn: combat-core.mjs 1026/600; combat.mjs 247/150; hud.mjs 885/150; turnflow.mjs 608/500
- **C12** fail: MODULE defined 0×; combat-core.mjs:27 MOD; combat.mjs:33 MOD; hud.mjs:26 MOD; offhand.mjs:21 MOD; riders.mjs:22 MOD; sequence.mjs:20 MOD; shapes.mjs:8 MOD; turnflow.mjs:23 MOD
- **C14** fail: pentaryn-combat: no lib/kit.lock.json — run vendor.py sync pentaryn-combat
- **C15** fail: sequence.mjs:17 import * as … from ./strip.mjs
- **C17** fail: hud.mjs:233 Hooks.once; hud.mjs:243 Hooks.once; hud.mjs:710 Hooks.on; hud.mjs:782 Hooks.on; hud.mjs:801 Hooks.on; hud.mjs:806 Hooks.on; hud.mjs:819 Hooks.on; hud.mjs:820 Hooks.on; hud.mjs:827 Hooks.on; hud.mjs:837 Hooks.on; hud.mjs:847 Hooks.on; hud.mjs:857 Hooks.on; … 20 more
- **C18** fail: combat-core.mjs: no install, uninstall
- **C19** fail: combat.mjs:122 emits 'pentarynCombat.bonusAction'; combat.mjs:89 emits 'pentarynCombat.offhand'; combat.mjs:90 emits 'pentarynCombat.bonusSpent'; sequence.mjs:252 emits 'pentarynCombat.usage'; sequence.mjs:302 emits 'pentarynCombat.sequenceEnd'; sequence.mjs:340 emits 'pentarynCombat.bonusSpent'; sequence.mjs:350 emits 'pentarynCombat.bonusSpent'
- **C20** fail: no test/golden/hooks.json
- **C21** fail: hud.mjs:189; hud.mjs:229; riders.mjs:359; turnflow.mjs:190
- **C22** fail: settings are registered but no file exports SETTINGS
- **C23** fail: riders.mjs:359 reads pentaryn-aoe
- **C24** fail: hud.mjs:41; hud.mjs:226; hud.mjs:506; hud.mjs:736; hud.mjs:797; hud.mjs:870; hud.mjs:877; riders.mjs:36; riders.mjs:189; riders.mjs:408; sequence.mjs:165; settings.mjs:52; … 7 more
- **C26** fail: turnflow.mjs:226 setTimeout 150 ms for readiness
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C29** fail: writes flags but publishes no inspect(ref)
- **C32** fail: turnflow.mjs:334 prototype assignment; turnflow.mjs:335 prototype assignment; turnflow.mjs:386 prototype assignment; turnflow.mjs:411 prototype assignment; turnflow.mjs:370 defineProperty on a prototype; row combat-argon-panel-injection has no wrapMethod patch naming it; row combat-argon-swing-pips has no wrapMethod patch naming it; row combat-argon-target-picker-reuse has no wrapMethod patch nami
- **C35** fail: hud.mjs:28 two-branch wrapper; riders.mjs:23 two-branch wrapper; sequence.mjs:21 two-branch wrapper; strip.mjs:12 two-branch wrapper; turnflow.mjs:24 two-branch wrapper; definite coverage 39% (65/166)
- **C36** warn: 3 literal(s): combat-core.mjs:485, combat-core.mjs:489, combat-core.mjs:491
- **C37w** warn: 2 !important (removing existing ones is [declared])
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; ## Data written out of order; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; missing ## Extending; … 4 more
- **C45** fail: no CHANGELOG.md

#### `pentaryn-creatures` — 53.7 %

- **C06w** warn: move to styles/ in Wave 7: creatures.css
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'creatures' ≠ 'pentaryn-creatures' (Wave 7 data migration, not blessed)
- **C09** fail: code names item-piles (creatures.mjs) but relationships do not
- **C10** warn: creatures.mjs 358/150
- **C14** fail: pentaryn-creatures: no lib/kit.lock.json — run vendor.py sync pentaryn-creatures
- **C18** fail: creatures-core.mjs: no install, uninstall
- **C20** fail: no test/golden/hooks.json
- **C21** fail: creatures.mjs:22; creatures.mjs:309; creatures.mjs:316; creatures.mjs:322
- **C22** fail: settings are registered but no file exports SETTINGS
- **C26** fail: creatures.mjs:343 setTimeout 0 around publish
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C32** fail: creatures.mjs:154 libWrapper.register; row creatures-libwrapper has no wrapMethod patch naming it
- **C35** fail: definite coverage 75% (6/8)
- **C37** fail: creatures.css: #pentaryn-creatures; creatures.css: #pentaryn-creatures .pcr-label; creatures.css: #pentaryn-creatures .pcr-token; creatures.css: #pentaryn-creatures .pcr-token.rank-0; creatures.css: #pentaryn-creatures .pcr-token:hover; creatures.css: #pentaryn-creatures .pcr-token:focus-visible; creatures.css: #pentaryn-creatures .pcr-token.controlled; creatures.css: #pentaryn-creatures .pcr-toke
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 4 more
- **C45** fail: no CHANGELOG.md
- **C47** fail: no adjustments row for item-piles with modules: [pentaryn-creatures]

#### `pentaryn-cursors` — 53.7 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C05** fail: unreachable: tools/build.mjs
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'cursors' ≠ 'pentaryn-cursors' (Wave 7 data migration, not blessed)
- **C10** warn: cursors.mjs 158/150
- **C13** fail: move to context/plans/: DESIGN.md, assets/src/CREDITS.md
- **C14** fail: pentaryn-cursors: no lib/kit.lock.json — run vendor.py sync pentaryn-cursors
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C21** fail: cursors.mjs:15; cursors.mjs:114
- **C22** fail: settings are registered but no file exports SETTINGS
- **C24** fail: tools/build.mjs:34
- **C25** fail: tools/build.mjs:36 console.error without the prefix; tools/build.mjs:120 console.log without the prefix; tools/build.mjs:122 console.error without the prefix; tools/build.mjs:134 console.log without the prefix
- **C26** fail: cursors.mjs:148 setTimeout 0 around publish
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C34** fail: top-level keys ['PENTARYN_CURSORS.Setting.enabled.Name', 'PENTARYN_CURSORS.Setting.enabled.Hint']; want ['PENTARYN_CURSORS']
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 4 more
- **C45** fail: no CHANGELOG.md

#### `pentaryn-dropbin` — 53.7 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'dropbin' ≠ 'pentaryn-dropbin' (Wave 7 data migration, not blessed)
- **C09** fail: code names item-piles (corpses.mjs, dropbin.mjs, loot.mjs) but relationships do not
- **C10** warn: dropbin.mjs 529/150
- **C12** fail: MODULE defined 2×: dropbin.mjs:63, loot-core.mjs:6
- **C14** fail: pentaryn-dropbin: no lib/kit.lock.json — run vendor.py sync pentaryn-dropbin
- **C17** fail: corpses.mjs:126 Hooks.on; corpses.mjs:226 Hooks.on; corpses.mjs:227 Hooks.on; corpses.mjs:228 Hooks.on; corpses.mjs:229 Hooks.on; corpses.mjs:231 Hooks.on; corpses.mjs:267 Hooks.once; corpses.mjs:283 Hooks.on; loot.mjs:152 Hooks.on; loot.mjs:154 Hooks.on; loot.mjs:156 Hooks.on
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C21** fail: dropbin.mjs:78; dropbin.mjs:116; dropbin.mjs:257; dropbin.mjs:258
- **C22** fail: settings are registered but no file exports SETTINGS
- **C24** fail: dropbin.mjs:391
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C35** fail: definite coverage 20% (1/5)
- **C36** warn: 4 literal(s): dropbin.mjs:217, dropbin.mjs:219, dropbin.mjs:224, dropbin.mjs:243
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 4 more
- **C45** fail: no CHANGELOG.md
- **C47** fail: no adjustments row for socketlib with modules: [pentaryn-dropbin]

#### `pentaryn-importer` — 62.2 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C07** fail: missing tier, namespace, flagScope, cssPrefix
- **C10** warn: pentaryn-importer.mjs 1243/150; README.md 263/250
- **C11** fail: no *-core.mjs / core.mjs
- **C12** fail: MODULE defined 0×; pentaryn-importer.mjs:103 MODULE_ID
- **C14** fail: pentaryn-importer: no lib/kit.lock.json — run vendor.py sync pentaryn-importer
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C25** fail: pentaryn-importer.mjs:213 console.log without the prefix; pentaryn-importer.mjs:214 console.warn without the prefix; pentaryn-importer.mjs:215 console.error without the prefix; pentaryn-importer.mjs:1202 console.log without the prefix; pentaryn-importer.mjs:1203 console.log without the prefix; pentaryn-importer.mjs:1204 console.log without the prefix; pentaryn-importer.mjs:1205 console.log without
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C36** warn: 5 literal(s): pentaryn-importer.mjs:697, pentaryn-importer.mjs:728, pentaryn-importer.mjs:744, pentaryn-importer.mjs:792, pentaryn-importer.mjs:890
- **C39** fail: no test/run.mjs; ModuleSpec gates ('parse', 'imports', 'i18n') — no node-test
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 6 more
- **C45** fail: no CHANGELOG.md

#### `pentaryn-journal` — 48.8 %

- **C06w** warn: move to styles/ in Wave 7: journal.css
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'journal' ≠ 'pentaryn-journal' (Wave 7 data migration, not blessed)
- **C09** fail: code names item-piles (journal.mjs) but relationships do not
- **C10** warn: journal.mjs 606/150
- **C12** fail: MODULE defined 0×; journal-core.mjs:27 MOD; journal.mjs:37 MOD
- **C14** fail: pentaryn-journal: no lib/kit.lock.json — run vendor.py sync pentaryn-journal
- **C18** fail: journal-core.mjs: no install, uninstall
- **C20** fail: no test/golden/hooks.json
- **C21** fail: journal.mjs:62; journal.mjs:168; journal.mjs:200; journal.mjs:520; journal.mjs:530; journal.mjs:536; journal.mjs:542
- **C22** fail: settings are registered but no file exports SETTINGS
- **C24** fail: journal.mjs:571
- **C26** fail: journal.mjs:597 setTimeout 0 around publish
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C30** fail: journal.mjs:547 unguarded query handler
- **C37** fail: journal.css: .pj-bar button; journal.css: .pj-bar .pj-add; journal.css: .pj-bar .pj-update; journal.css: .pj-bar .pj-open; journal.css: .pj-bar button:disabled; journal.css: .pj-bar .pj-hint; journal.css: .pj-bar .pj-hint; journal.css: .pj-bar .pj-hint; journal.css: nav.toc li.pj-just-added > .page-heading; journal.css: article.journal-entry-page.pj-just-added; … 8 more
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 5 more
- **C45** fail: no CHANGELOG.md
- **C46** fail: no context/foundry/journal.md and no route in context/foundry/README.md
- **C47** fail: no adjustments row for item-piles with modules: [pentaryn-journal]

#### `pentaryn-lookup` — 63.2 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C07** fail: missing tier, namespace, flagScope, cssPrefix, generation
- **C10** warn: pentaryn-lookup.mjs 447/150
- **C12** fail: MODULE defined 0×
- **C14** fail: pentaryn-lookup: no lib/kit.lock.json — run vendor.py sync pentaryn-lookup
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C24** fail: pentaryn-lookup.mjs:234
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 7 more
- **C45** fail: no CHANGELOG.md
- **C48** fail: pentaryn-lookup.mjs:434 `selftest`

#### `pentaryn-movement` — 53.7 %

- **C03** fail: relationships.systems names dnd5e but no source touches it
- **C06w** warn: move to styles/ in Wave 7: movement.css
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'movement' ≠ 'pentaryn-movement' (Wave 7 data migration, not blessed)
- **C10** warn: movement.mjs 427/150
- **C12** fail: movement.mjs:39 MOD
- **C14** fail: pentaryn-movement: no lib/kit.lock.json — run vendor.py sync pentaryn-movement
- **C18** fail: movement-core.mjs: no install, uninstall
- **C20** fail: no test/golden/hooks.json
- **C21** fail: movement.mjs:51; movement.mjs:337; movement.mjs:348; movement.mjs:351; movement.mjs:355
- **C22** fail: settings are registered but no file exports SETTINGS
- **C24** fail: movement.mjs:379; movement.mjs:385
- **C26** fail: movement.mjs:406 setTimeout 0 around publish
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C35** fail: definite coverage 44% (12/27)
- **C37** fail: movement.css: #scene-controls button.tool.pm-blocked; movement.css: #scene-controls button.tool.pm-blocked::after
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; missing ## Extending; … 3 more
- **C45** fail: no CHANGELOG.md

#### `pentaryn-names` — 64.1 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'names' ≠ 'pentaryn-names' (Wave 7 data migration, not blessed)
- **C11** fail: no *-core.mjs / core.mjs
- **C12** fail: MODULE defined 0×
- **C14** fail: pentaryn-names: no lib/kit.lock.json — run vendor.py sync pentaryn-names
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C34** fail: top-level keys ['PENTARYN_NAMES.Synced']; want ['PENTARYN_NAMES']
- **C39** fail: no test/run.mjs; ModuleSpec gates ('parse', 'imports', 'i18n') — no node-test
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 6 more
- **C45** fail: no CHANGELOG.md

#### `pentaryn-pings` — 60.5 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'pings' ≠ 'pentaryn-pings' (Wave 7 data migration, not blessed)
- **C10** warn: pings.mjs 242/150
- **C11** fail: no *-core.mjs / core.mjs
- **C14** fail: pentaryn-pings: no lib/kit.lock.json — run vendor.py sync pentaryn-pings
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C21** fail: pings.mjs:56; pings.mjs:65; pings.mjs:188; pings.mjs:195
- **C22** fail: settings are registered but no file exports SETTINGS
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C32** fail: pings.mjs:183 prototype assignment
- **C36** warn: 1 literal(s): pings.mjs:197
- **C39** fail: no test/run.mjs; no ModuleSpec in scripts/foundry/ops/config.py
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C44** fail: no README.md
- **C45** fail: no CHANGELOG.md

#### `pentaryn-portals` — 57.9 %

- **C06w** warn: move to styles/ in Wave 7: portals.css
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'portals' ≠ 'pentaryn-portals' (Wave 7 data migration, not blessed)
- **C09** fail: code names item-piles (portals.mjs) but relationships do not
- **C10** warn: portals.mjs 851/150
- **C14** fail: pentaryn-portals: no lib/kit.lock.json — run vendor.py sync pentaryn-portals
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C24** fail: portals.mjs:238; portals.mjs:273; portals.mjs:502; portals.mjs:597
- **C26** fail: portals.mjs:845 setTimeout 0 around publish
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C36** warn: 8 literal(s): portals.mjs:111, portals.mjs:365, portals.mjs:366, portals.mjs:368, portals.mjs:369, portals.mjs:370, portals.mjs:486, portals.mjs:674
- **C37** fail: portals.css: .pentaryn-portal-dialog .pp-cards; portals.css: .pp-card; portals.css: .pp-card .pp-thumb; portals.css: .pp-card .pp-text h4; portals.css: .pp-card .pp-desc; portals.css: .pp-choice; portals.css: .pp-choice input[type="radio"]; portals.css: .pp-choice:has(input:checked); portals.css: .pp-config .pp-preview; portals.css: .pp-config .pp-snap; … 39 more
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 5 more
- **C45** fail: no CHANGELOG.md
- **C47** fail: no adjustments row for item-piles with modules: [pentaryn-portals]

#### `pentaryn-prompts` — 51.2 %

- **C07** fail: missing tier, namespace, cssPrefix
- **C10** warn: character.mjs 956/500; geometry-core.mjs 1454/600; prompts.mjs 352/150; replace.mjs 744/500
- **C14** fail: pentaryn-prompts: no lib/kit.lock.json — run vendor.py sync pentaryn-prompts
- **C15** fail: dialog.mjs:22 import * as … from ./typeahead.mjs; prompts.mjs:13 import * as … from ./typeahead.mjs — not a feature (no install export)
- **C16** fail: dialog.mjs (ui) → markers.mjs (glue); dialog.mjs (ui) → model.mjs (glue); dialog.mjs (ui) → typeahead.mjs (feature); unclassified (glue): character.mjs, crops.mjs, gather.mjs, los.mjs, markers.mjs, model.mjs, npc.mjs, patch.mjs, replace.mjs
- **C18** fail: typeahead.mjs: no install, uninstall
- **C20** fail: no test/golden/hooks.json
- **C21** fail: dialog.mjs:28; gather.mjs:14; model.mjs:290; prompts.mjs:23; prompts.mjs:33; prompts.mjs:38; prompts.mjs:42; prompts.mjs:46; prompts.mjs:52; prompts.mjs:82; prompts.mjs:340
- **C22** fail: settings are registered but no file exports SETTINGS
- **C24** fail: character.mjs:102; character.mjs:420; character.mjs:921; gather.mjs:150; gather.mjs:151; gather.mjs:225; model.mjs:50; model.mjs:145; model.mjs:149; model.mjs:150; model.mjs:151; prompts.mjs:128; … 3 more
- **C26** fail: prompts.mjs:316 setTimeout 0 around publish
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C32** fail: prompts.mjs:169 libWrapper.register
- **C35** fail: definite coverage 36% (16/44)
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; missing ## Extending; … 4 more
- **C45** fail: no CHANGELOG.md
- **C47** fail: no adjustments row for item-piles with modules: [pentaryn-prompts]; no adjustments row for lib-wrapper with modules: [pentaryn-prompts]
- **C48** fail: prompts.mjs:344 `version`

#### `pentaryn-riders` — 47.6 %

- **C06w** warn: move to styles/ in Wave 7: riders.css
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'riders' ≠ 'pentaryn-riders' (Wave 7 data migration, not blessed)
- **C09** fail: code names enhancedcombathud (argon-tidy.mjs, rituals.mjs) but relationships do not
- **C10** warn: riders.mjs 663/150
- **C12** fail: MODULE defined 0×; riders-core.mjs:24 MOD; riders.mjs:49 MOD; rituals.mjs:29 MOD; table-core.mjs:6 MOD
- **C14** fail: pentaryn-riders: no lib/kit.lock.json — run vendor.py sync pentaryn-riders
- **C17** fail: argon-tidy.mjs:25 Hooks.on; argon-tidy.mjs:38 Hooks.on; concentration.mjs:35 Hooks.once; concentration.mjs:45 Hooks.on; concentration.mjs:58 Hooks.on; concentration.mjs:75 Hooks.on; rituals.mjs:46 Hooks.once; rituals.mjs:56 Hooks.on; rituals.mjs:87 Hooks.once
- **C18** fail: riders-core.mjs: no install, uninstall
- **C20** fail: no test/golden/hooks.json
- **C21** fail: concentration.mjs:32; concentration.mjs:36; riders.mjs:145; riders.mjs:292; riders.mjs:431; riders.mjs:439; riders.mjs:496; riders.mjs:623; riders.mjs:628; rituals.mjs:34; rituals.mjs:47
- **C22** fail: settings are registered but no file exports SETTINGS
- **C26** fail: riders.mjs:651 setTimeout 0 around publish
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C29** fail: writes flags but publishes no inspect(ref)
- **C30** fail: riders.mjs:637 unguarded query handler
- **C32** fail: rituals.mjs:92 prototype assignment; row riders-argon-ritual-adept-list has no wrapMethod patch naming it
- **C35** fail: definite coverage 43% (9/21)
- **C36** warn: 4 literal(s): riders-core.mjs:62, riders-core.mjs:74, riders-core.mjs:86, riders-core.mjs:97
- **C37** fail: riders.css: .dnd5e2.sheet.actor.character .meter-group > .label > .pr-hd; riders.css: .dnd5e2.sheet.actor.character .meter-group > .label .pr-hd-b; riders.css: .dnd5e2.sheet.actor.character .meter-group > .label .pr-hd-b; riders.css: .dnd5e2.sheet.actor.character .meter-group > .label .pr-hd-b; riders.css: .chat-message button.pr-labelled[data-action="breakConcentra; riders.css: .chat-message butt
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 4 more
- **C45** fail: no CHANGELOG.md

#### `pentaryn-senses` — 48.8 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'senses' ≠ 'pentaryn-senses' (Wave 7 data migration, not blessed)
- **C10** warn: light.mjs 819/500
- **C12** fail: MODULE defined 2×: chain-core.mjs:10, migrate.mjs:12; senses.mjs:32 SCOPE
- **C13** fail: move to context/plans/: LIGHT-DESIGN.md
- **C14** fail: pentaryn-senses: no lib/kit.lock.json — run vendor.py sync pentaryn-senses
- **C17** fail: glow.mjs:162 Hooks.once
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C21** fail: light.mjs:269; migrate.mjs:81; migrate.mjs:99; migrate.mjs:105
- **C22** fail: settings are registered but no file exports SETTINGS
- **C24** fail: light.mjs:495; migrate.mjs:36; migrate.mjs:100
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C34** fail: top-level keys ['PENTARYN_SENSES.Light.Title', 'PENTARYN_SENSES.Light.Where', 'PENTARYN_SENSES.Light.OnMe', 'PENTARYN_SENSES.Light.Pick']…; want ['PENTARYN_SENSES']
- **C35** fail: light.mjs:39 two-branch wrapper
- **C36** warn: 2 literal(s): chain.mjs:225, glow.mjs:155
- **C37** fail: styles/light.css: .dnd5e2 .items-section .item .item-row > .ps-light-controls; styles/light.css: .dnd5e2 .items-section .item .item-row > .ps-light-controls ; styles/light.css: .dnd5e2 .items-section .item .item-row > .ps-light-controls ; styles/light.css: .dnd5e2 .items-section .item .item-row > .ps-light-controls ; styles/light.css: .dnd5e2 .items-section .item .item-row > .ps-light-controls ; s
- **C37w** warn: 1 !important (removing existing ones is [declared])
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 6 more
- **C45** fail: no CHANGELOG.md
- **C48** fail: chain.mjs:261 `uninstall`; light.mjs:709 `uninstall`

#### `pentaryn-ties` — 43.9 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'ties' ≠ 'pentaryn-ties' (Wave 7 data migration, not blessed)
- **C09** fail: code names dice-so-nice (study.mjs) but relationships do not; code names item-piles (pentaryn-ties.mjs, preview.mjs) but relationships do not
- **C10** warn: attributes-ui.mjs 1044/500; attributes.mjs 1304/500; editor.mjs 645/500; known-core.mjs 2393/600; known.mjs 976/500; overlay.mjs 519/500; pentaryn-ties.mjs 1018/150; preview.mjs 805/500; review-ui.mjs 736/500; study.mjs 2891/500; tie-dialog.mjs 759/500; styles/ties.css 1946/400; README.md 521/250
- **C12** fail: MODULE defined 2×: pentaryn-ties.mjs:50, ties-api.mjs:14; item-marks.mjs:9 MODULE_ID
- **C14** fail: pentaryn-ties: no lib/kit.lock.json — run vendor.py sync pentaryn-ties
- **C15** fail: overlay.mjs:46 import * as … from ./popups.mjs; pentaryn-ties.mjs:34 import * as … from ./ties-api.mjs — not a feature (no install export); pentaryn-ties.mjs:35 import * as … from ./overlay.mjs — not a feature (no install export); pentaryn-ties.mjs:36 import * as … from ./popups.mjs — not a feature (no install export); pentaryn-ties.mjs:37 import * as … from ./worn.mjs — not a feature (no install 
- **C16** fail: attributes-ui.mjs (feature) → ties-api.mjs (api); attributes-ui.mjs (feature) → attributes.mjs (feature); attributes-ui.mjs (feature) → lore.mjs (glue); attributes-ui.mjs (feature) → study.mjs (feature); attributes.mjs (feature) → ties-api.mjs (api); describe.mjs (feature) → ties-api.mjs (api); editor.mjs (ui) → ties-api.mjs (api); editor.mjs (ui) → authoring.mjs (glue); editor.mjs (ui) → tie-dial
- **C18** fail: attributes-ui.mjs: no install, uninstall; attributes.mjs: no install, uninstall; describe.mjs: no install, uninstall; item-marks.mjs: no install, uninstall; known.mjs: no install, uninstall; overlay.mjs: no install, uninstall; popups.mjs: no install, uninstall; study.mjs: no install, uninstall; ties-api.mjs: no install, uninstall; worn.mjs: no install, uninstall
- **C20** fail: no test/golden/hooks.json
- **C21** fail: attributes.mjs:171; attributes.mjs:1017; overlay.mjs:89; overlay.mjs:132; pentaryn-ties.mjs:182; pentaryn-ties.mjs:188; pentaryn-ties.mjs:207; pentaryn-ties.mjs:226; pentaryn-ties.mjs:233; pentaryn-ties.mjs:253; pentaryn-ties.mjs:260; pentaryn-ties.mjs:273; … 17 more
- **C22** fail: settings are registered but no file exports SETTINGS
- **C24** fail: look.mjs:157; look.mjs:277; preview.mjs:191; preview.mjs:193; preview.mjs:713; review-ui.mjs:481
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C34** fail: top-level keys ['PENTARYN_TIES.title', 'PENTARYN_TIES.windowTitle', 'PENTARYN_TIES.macroName', 'PENTARYN_TIES.empty']…; want ['PENTARYN_TIES']
- **C35** fail: definite coverage 90% (425/473)
- **C36** warn: 3 literal(s): attributes-ui.mjs:767, preview.mjs:108, preview.mjs:115
- **C37** fail: styles/ties.css: .pentaryn-known .pt-summary; styles/ties.css: .pentaryn-known .pt-known-when; styles/ties.css: .pentaryn-known .pt-known-intro; styles/ties.css: .pentaryn-known .pt-fields; styles/ties.css: .pentaryn-known .pt-group-head + .pt-list; styles/ties.css: .pentaryn-known .pt-summary; styles/ties.css: .pentaryn-known .pt-fields; styles/ties.css: .pentaryn-tie-dialog .pt-dlg; styles/ties.
- **C39** fail: no test/run.mjs; ModuleSpec gates ('parse', 'imports', 'i18n') — no node-test
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 6 more
- **C45** fail: no CHANGELOG.md
- **C47** fail: no adjustments row for item-piles with modules: [pentaryn-ties]
- **C48** fail: pentaryn-ties.mjs:336 `describe`

#### `pentaryn-transform` — 48.8 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'transform' ≠ 'pentaryn-transform' (Wave 7 data migration, not blessed)
- **C10** warn: hud.mjs 761/150; transform-core.mjs 638/600; transform.mjs 788/150
- **C12** fail: MODULE defined 0×; transform-core.mjs:23 MODULE_ID
- **C13** fail: move to context/plans/: WILDSHAPE-DESIGN.md
- **C14** fail: pentaryn-transform: no lib/kit.lock.json — run vendor.py sync pentaryn-transform
- **C16** fail: hud.mjs:17 imports the entry transform.mjs; starry.mjs:21 imports the entry transform.mjs; unclassified (glue): starry.mjs
- **C17** fail: hud.mjs:84 Hooks.on; hud.mjs:85 Hooks.on; hud.mjs:89 Hooks.once; hud.mjs:581 Hooks.on; hud.mjs:594 Hooks.on; hud.mjs:657 Hooks.on; hud.mjs:662 Hooks.on; hud.mjs:686 Hooks.on; hud.mjs:696 Hooks.on; hud.mjs:710 Hooks.on; hud.mjs:746 Hooks.on; hud.mjs:759 Hooks.on; … 8 more
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C21** fail: hud.mjs:529; hud.mjs:529; transform.mjs:150
- **C23** fail: hud.mjs:529 reads pentaryn-combat; hud.mjs:529 reads pentaryn-combat
- **C24** fail: hud.mjs:39
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C29** fail: writes flags but publishes no inspect(ref)
- **C35** fail: hud.mjs:23 two-branch wrapper; starry.mjs:23 two-branch wrapper; transform.mjs:17 two-branch wrapper
- **C37** fail: styles/transform.css: .extended-combat-hud .action-element.pentaryn-return; styles/transform.css: .extended-combat-hud .action-element.pentaryn-return .action; styles/transform.css: .extended-combat-hud .pentaryn-empty; styles/transform.css: .extended-combat-hud .action-element.pentaryn-starry-on; styles/transform.css: .extended-combat-hud .pentaryn-starry-act; styles/transform.css: .extended-comb
- **C37w** warn: 3 !important (removing existing ones is [declared])
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## Settings; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; missing ## Extending; missing ## Pitfalls; … 2 more
- **C45** fail: no CHANGELOG.md
- **C49** warn: starry.mjs:314 updateWorldTime ×1 (no // hot: comment); transform.mjs:676 updateWorldTime ×1 (no // hot: comment)

#### `pentaryn-walls` — 59.0 %

- **C02** warn: minimum is 13 (raise in the Wave 7 restart batch)
- **C07** fail: missing tier, namespace, cssPrefix; flagScope 'wall-autocomplete' ≠ 'pentaryn-walls' (Wave 7 data migration, not blessed)
- **C10** warn: pentaryn-walls.mjs 282/150; wall-engine.mjs 1081/500; README.md 283/250
- **C11** fail: no *-core.mjs / core.mjs
- **C12** fail: MODULE defined 0×; pentaryn-walls.mjs:19 MODULE_ID
- **C14** fail: pentaryn-walls: no lib/kit.lock.json — run vendor.py sync pentaryn-walls
- **C18** fail: no feature files (entry `import * as` targets exporting install)
- **C20** fail: no test/golden/hooks.json
- **C21** fail: pentaryn-walls.mjs:41; pentaryn-walls.mjs:207
- **C22** fail: settings are registered but no file exports SETTINGS
- **C24** fail: pentaryn-walls.mjs:107
- **C27** fail: no api-manifest.mjs; buildApi not used
- **C28** fail: no test/golden/describe.json; no test/golden/surface.json
- **C36** warn: 8 literal(s): pentaryn-walls.mjs:45, pentaryn-walls.mjs:148, pentaryn-walls.mjs:209, pentaryn-walls.mjs:220, pentaryn-walls.mjs:224, pentaryn-walls.mjs:231, pentaryn-walls.mjs:240, pentaryn-walls.mjs:248
- **C40** fail: missing test/core.test.mjs, test/glue.test.mjs, test/hooks.test.mjs, test/api.test.mjs, test/i18n.test.mjs
- **C41** fail: no test compares VERSION with module.json
- **C43** fail: test/run.mjs is not the fixed node:test body (§5.2)
- **C44** fail: missing ## What the player sees; missing ## Settings; missing ## API; missing ## Data written; missing ## Flags other modules read; missing ## Events; missing ## Patches and adjustments; missing ## Two sessions; … 7 more
- **C45** fail: no CHANGELOG.md

