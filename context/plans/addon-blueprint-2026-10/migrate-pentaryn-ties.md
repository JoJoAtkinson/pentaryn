---
title: Migration guide — pentaryn-ties to the addon blueprint
status: plan
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, migration, ties]
---

# Migrating `pentaryn-ties` to the blueprint

**Read this when:** you are about to restructure `foundry/module/pentaryn-ties` during the fix
phase that follows the 2026-10 code audit, or you are fixing one of its `ties-*` audit findings
and need to know whether that finding is part of the restructure or a standalone fix.
**Not this file:** the general procedure is in
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) §8. The checklist it
scores against is in [`../addon-blueprint-2026-10.md`](../addon-blueprint-2026-10.md) §8. The
cross-module order is in [`migration-order.md`](migration-order.md) (ties is #15).

This guide is a point-in-time plan. Line numbers refer to the frozen audit snapshot
(`scratchpad/audit-snapshot/pentaryn/module/pentaryn-ties`). On 2026-10-10 that snapshot was
byte-identical to the live `foundry/module/pentaryn-ties` (checked with `diff -rq`, repo HEAD
`ee505c2`). Re-check that before step S0 and re-anchor any line that has moved. Work from
`conformance.py --module ties --markdown` run live, not from the table below.

> **Re-anchored to 4e64f47 on 2026-10-11.** The live module is no longer byte-identical to the
> snapshot: commit 17275c9 (usability re-run, U-7-3, 0.19.3 → 0.19.4) changed `known-core.mjs`
> (+41 lines at :1801, `tablePCs`/`switchLabels`), `preview.mjs` (+18 lines at :160–181,
> `playerCharacters` reads users and ownership), `README.md` (+9, a 0.19.4 section at :511),
> `module.json` (version only) and `test/known.mjs` (179 → 183 cases). Every other file is unchanged,
> so its line numbers stand. Lines in §1, §2.1, S1, S4, S5, S6, S10, S11 and S13 below are updated
> to HEAD, with the snapshot line in parentheses where it helps. Re-scored live: **43.9 % (18/41)**,
> same failing set. No step or finding was resolved or made obsolete by the re-run; audit gains
> **ties-46** (standalone, §4) and extensions to ties-15/36/43.

---

## 0. At a glance

| | |
|---|---|
| Tier | **full** (persistent world stores, API writes, settings) |
| Score today | **43.9 %** (18 of 41 fail-class rules pass), 23 failing, warnings C02, C10, C36 — re-scored live at 4e64f47 on 2026-10-11, unchanged |
| Projected after S0–S13 | **≈ 93 %** (41 of 44 applicable). C07, C09 and C39 stay open until the Wave 7 restart batch and the `config.py` gate edit |
| Projected after Wave 7 batch + gate edit | **100 %** of fail-class rules, with C10 size warnings left (accepted, see §2.3) |
| Structural steps | **15** (S0–S13 plus S4b), plus one batch hand-off (S14) |
| Audit findings | 44 (`ties-1`, `ties-3`…`ties-46`; there is no `ties-2` or `ties-11`). **20 absorbed** by structural steps, **24 standalone** (ties-46 added on the 2026-10-11 re-anchor) |
| WAIT | **No.** Ties is not in `wait.json`. It imports, reads and emits nothing from combat, transform or aoe. One caveat on a shared adjustments row is in §6 |
| Declared changes | 11 (§5). One of them (**B1b**) is a blueprint gap that needs a decision from Joe before S8 |
| Effort | **XL**: about 93–110 h structural, plus 30–40 h for the standalone findings (§7) |
| Prerequisites | K2 top-level reserved names — **blocked on D1**; K5 `buildApi` freezes a copy — **landed** (kit 1.0.1); K9 blueprint gaps G1/G3/G4/G5 — open; D1 (Joe) — open |
| Scores | §1 was scored before scorer fixes R2–R9 ([design record](../addon-blueprint-2026-10.md) §7.5). **After R-fixes: re-score** — `conformance.py --module ties --markdown`. No status changed on the snapshot; C48 now also lists `study.inspect` and `attributes.describe` (R4), and C07 says manifest-only (R3) |
| Shared-file batches | `module.json` edits → [`wave7-restart-batch.md`](wave7-restart-batch.md); adjustments rows → [`adjustments-batch.md`](adjustments-batch.md) (append in the Record step) |

---

## 1. Conformance today, item by item

Scored with `conformance.py --snapshot <audit-snapshot> --module ties --json` on 2026-10-10; re-scored
live (`conformance.py --module ties`) at 4e64f47 on 2026-10-11 with the same result. Details below are
the live run's.
"Clears in" names the step below that fixes the rule.

| Rule | Today | Detail (snapshot) | Clears in |
|---|---|---|---|
| C01 id = folder | pass | | — |
| C02 minimum 14 | **warn** | `compatibility.minimum` is `"13"` | S14 (Wave 7) |
| C03 dnd5e relationship | pass | | — |
| C04 languages | pass | | — |
| C05 reachable from esmodules | pass | dynamic imports of `tie-dialog.mjs`/`relay.mjs` count | keep passing (S7, S12 add files) |
| C06 / C06w styles | pass | `styles/ties.css` is already under `styles/` | — |
| C07 `flags.pentaryn` | **fail** | has only `flagScope: "ties"`, `generation: 14`. Missing `tier`, `namespace`, `cssPrefix`. **Note:** the scorer calls `flagScope 'ties'` a "Wave 7 data migration". For ties that is wrong. Every flag is already written under `pentaryn-ties` (`MODULE`, ties-api.mjs:14), so only the manifest field is mislabelled and no data moves (gap G6) | S14 |
| C08 socket | pass | `socket: true`, `module.pentaryn-ties` channel used | — |
| C09 relationships name packages | **fail** | `dice-so-nice` (study.mjs:911) and `item-piles` (pentaryn-ties.mjs:968, preview.mjs:173) are not in `relationships` | S14 (`recommends` with `reason`) |
| C10 sizes | **warn** | entry 1018/150, study 2891, known-core 2434, attributes 1304, attributes-ui 1044, known 976, preview 823, tie-dialog 759, review-ui 736, editor 645, overlay 519, css 1946/400, README 530/250 | S4, S4b, S7, S13 fix known-core, study, entry and README. The rest stay as warnings (§2.3) |
| C11 core purity | pass | known-core.mjs is pure | must keep passing for `ties-core.mjs` + `core/*` |
| C12 one `MODULE` | **fail** | pentaryn-ties.mjs:50, ties-api.mjs:14, item-marks.mjs:9 `MODULE_ID` | S3 |
| C13 stray `.md` | pass | | — |
| C14 kit lock | **fail** | no `lib/kit.lock.json` | S1 |
| C15 `import * as` | **fail** | entry :34–48 (10 namespace imports of non-features), overlay.mjs:46 | S7 |
| C16 import direction | **fail** | 28 edges (attributes-ui→attributes, known→study, tie-dialog→editor, …), 6 unclassified files | S12 (renames + `graph-allow.json`, see gap G1) |
| C17 module-scope hooks only in entry | pass | | must keep passing |
| C18 features export install/uninstall | **fail** | 10 files | S7 |
| C19 emitted hook names | pass | ties emits no hooks (`HOOKS = {}`) | — |
| C20 `golden/hooks.json` | **fail** | | S2 |
| C21 settings only in settings.mjs | **fail** | 29 sites: attributes.mjs:171,187,1017,1041,1064 · overlay.mjs:89,132 · popups.mjs:328,342 · preview.mjs:209,211 · study.mjs:405,417,426,1096,1129,1144,1424,2470,2792 · ties-api.mjs:105 · entry :182–297, 509, 519, 540, 592 | S6 |
| C22 `SETTINGS` exported | **fail** | | S6 |
| C23 no foreign settings | pass | | — |
| C24 no empty catch | **fail** | look.mjs:157, 277 · preview.mjs:209, 211, 731 · review-ui.mjs:481 (comment-only `catch { /* unborn */ }`) | S5 |
| C25 console prefix | pass | | — |
| C26 publish timers | pass | | — |
| C27 api-manifest + buildApi | **fail** | | S8 |
| C28 describe/surface goldens | **fail** | | S2 (legacy surface), S8 (new goldens) |
| C29 inspect | pass (scorer) | ties writes actor flags and has no `inspect`, so it should be added anyway (ties-3) | S8 |
| C30 queries | pass | none (ties uses `game.socket`) | — |
| C31 writes ok/fail | manual | see §5 (legacy shapes kept with `legacy: true`) | S8 |
| C32 patches | pass | no prototype patches | — |
| C33 private access | manual | `_onFirstRender`/`_onClose`/`_on*` in look, preview, review-ui. These are ApplicationV2 lifecycle overrides, not wraps, so no row is needed. Rows: `dsn-skip-blind-study`, `dnd5e-legacy-roll-modes`, `core-ties-flag-wipe` | S14 (file paths) |
| C34 lang nested | **fail** | 473 flat dotted keys at the top level. Nesting them is safe: Foundry `expandObject`s flat keys on load, and no leaf is also a prefix (checked) | S10 |
| C35 i18n coverage ≥ 90 % | **fail** | 425/473 = 89.9 %. The 48 non-definite keys are template-built families (`attributes.filter.*`, `.carried.*`, `.help.*`, `.ns.*`, `known.category.*`, `known.share.skip.*`, `known.study.mode.*`, `known.inspect.scope{2,3,5,6}`, `review.sort.*`, `review.tab.*`, `stance.*`, `group.*`, `dialog.reverse*Label`) | S10 |
| C36 hard-coded English | **warn** | attributes-ui.mjs:767, preview.mjs:108, 115 (+ entry :755–756, review-ui ~340/392, preview ~344–420, 502 per ties-44) | S10 |
| C37 CSS scope | **fail** | 201 selectors. Once `cssPrefix: "pt-"` is declared (S14), **56** still fail: `.pentaryn-tie-dialog input/select/textarea/:disabled`, `#pentaryn-ties-cards`, ~50 `.pentaryn-inspect-preview …`. No `!important` (C37w passes) | S11 + S14 |
| C38 prefix unique | n/a | no `cssPrefix` declared. `pt-` is used by no other module (checked) | S14 |
| C39 `test/run.mjs` + node-test gate | **fail** | no runner. ModuleSpec gates are `parse, imports, i18n` only (config.py:117, finding ties-1 / python-tooling-7) | S1 (runner) + §10 gate edit |
| C40 required tests | **fail** | core, glue, hooks, api, i18n tests missing | S2 |
| C41 VERSION test | **fail** | | S2/S3 |
| C42 fixtures synthetic | n/a → manual | | S1 |
| C43 legacy suites | n/a | | S1 |
| C44 README order | **fail** | 14 sections missing or out of order. Changelog sections are mixed in at README.md:501–529, and 0.19.4 (:511) sits above 0.19.3 (:520) | S13 |
| C45 CHANGELOG | **fail** | | S13 |
| C46 routing | pass | `context/foundry/attributes.md` + README route | — |
| C47 adjustments for packages | **fail** | no `item-piles` row for `pentaryn-ties` | S14 (adjustments batch) |
| C48 reserved names | **fail** | pentaryn-ties.mjs:336 `describe`. The scorer misses two more: **`attributes.describe`** (:431) and **`study.inspect`** (:402). The kit's `buildApi` refuses reserved names at any depth (foundry/lib/api.mjs:31–37, pinned by foundry/lib/test/api.test.mjs:44), so S8 would throw at load (gap G2) | S8 (+ decision B1b) |
| C49 hot hooks | pass | refreshToken/sightRefresh handlers only schedule frames. Still add a `// hot:` comment when moving them (S7) | S7 |
| C50 publish timing | n/a | | S9 (`when: "ready"`; publish runs synchronously inside the ready handler before its first `await`) |
| C51 settings labels literal | n/a | | S6 (see gap G3 for the client `pinnedCards` row) |
| C52 legacyName has until | pass | | — |

---

## 2. Target layout

### 2.1 Old file → new file

Roles are the scorer's (`role_of`, conformance.py:194). **Domain** is not a blueprint role. It
names the Foundry-aware, non-UI logic files that the scorer classifies as `glue`. Every import
edge into them is listed in `test/graph-allow.json` with a reason (gap G1).

| Target file | Role | Comes from (snapshot lines) | Notes |
|---|---|---|---|
| `pentaryn-ties.mjs` | entry (esmodules[0], name kept per D11) | :1–56 header/imports, :57–302 init (shrinks to wiring), :469–505 ready | ≲ 150 lines. `log`/`reg`/`ctx`, synchronous `install()` calls in today's order, `Hooks.once("init")`, `Hooks.once("ready")`, `uninstall()` |
| `ties-core.mjs` **new** | core | ties-api.mjs:14–45 (`MODULE`, `FLAG`, `LEGACY_SCOPE`, `STANCES`, `STRENGTHS`, `NOTES_MAX`, `WORD_MAX`, `clamp*`, `stanceOf`) · tie-dialog.mjs:661–688 + relay.mjs:122–148 pure mirror rules (ties-12) | adds `SHORT="ties"`, `NS="ties"`, `VERSION="0.19.4"`, `CONTRACT="pentaryn-ties/api@1"`, `I18N="PENTARYN_TIES"`, `CSS={prefix:"pt-"}`, `HOOKS=Object.freeze({})` |
| `known-core.mjs` | core (barrel) | whole file → `export * from "./core/…"` | path kept: attributes.md documents `import("/modules/pentaryn-ties/known-core.mjs")` |
| `core/known.mjs` | core | known-core.mjs:1–400 | Known schema, `readKnown`, `readGranted`, `grantsForEntry`, `visibleAttributesFor`, `toStoredKnown` |
| `core/study.mjs` | core | :401–640, :779–916 | study ladder, `tierOf`, `readStudyTiers`, `readStudied`, `readBeliefs`, `mayStudy` |
| `core/lore.mjs` | core | :917–1148 | lore rows, `parseFactKey`, `parseLedgerKey` |
| `core/attributes.mjs` | core | :641–778 (registry index/tree: `indexRegistry`, `childrenOf`, `subtreeOf`, `forestOf`, `contractForest`) + :1149–1764 | registry, `clampAttribute`, review, sources, `ancestorsOf`, `identificationLadder` |
| `core/ledgers.mjs` | core | :1765–1800 + :1842–2114 (snapshot :1765–2073) | `readKnowledge`, `identifiedKey`, `identifiedState`, `planStep`, `deriveAttributes`, `combineAdvantage`, `attrFactKey`, `readAttrBeliefs`, `holdResolved`. Gains `rolledMiss` (ties-13), `isIdentKey`/`CONCEAL_FLAG`/`INSPECT_CLAIM_KEY` (ties-14), `concealFor` (ties-9 part 3) |
| `core/roster.mjs` **new** | core | :1801–1841 (added by 17275c9, not in the snapshot) | `tablePCs`, `switchLabels` (+ `firstName`, ties-15). Imports nothing |
| `core/prose.mjs` | core | :2115–2298 (snapshot :2074–2257) | enricher/prose flattening, `composeReveal` |
| `core/facts.mjs` | core | :2299–2433 (snapshot :2258–2392) | `shareStatus`, `factKeyOf`, `factOrder` |
| `core/html.mjs` **new** | core | the hand-rolled `esc` copies (editor:35, tie-dialog:31, known:55, worn:40, authoring:36, lore:44, attributes-ui:47, study:123) | **byte-identical `&#39;` escaper**. look/preview/review-ui keep `foundry.utils.escapeHTML` (different bytes for `'`) |
| `api-manifest.mjs` **new** | manifest | entry :310–460 (`publishAPI` literal) | ~96 rows, pure data |
| `api.mjs` **new** | api | — | impl map for adapter/settings-level paths, `inspect` (= ties-3 dossier), `selftest`, `buildApiFor(ctx)` |
| `ties-api.mjs` | api (compat barrel) | ties-api.mjs whole → re-exports of `ties-core` + `ties-adapter` + `mayWrite` | kept one release for external macros (`until: pentaryn-ties 1.0`). Reachable from the entry by a bare `import "./ties-api.mjs"` |
| `ties-adapter.mjs` **new** | adapter | ties-api.mjs:47–382 Foundry half (`stanceLabel`, `baseActorOf`, `presentActorIds`, `read`, `inbound`, `write`, `setTie`, `setNotes`, `removeTie`, `migrateLegacy`, `canReach`) · the `canSee` copies (overlay:102, known:251, popups:367) · `inspectorFor` (entry :802–809) · `readWorn` (worn.mjs, so popups no longer imports a feature) | `mayWrite` does **not** move here (it reads a setting) |
| `settings.mjs` **new** | settings | entry :80–297 (6 keybindings incl. describe.mjs:151–160 + 10 settings) · `mayWrite` (ties-api.mjs:102–110, verbatim) · `reg()`/`stackingRule()`/`holdDefault()` readers (study.mjs:403–430) | `SETTINGS`, `keybindingRows(handlers)`, `registerSettings()`, `registerKeybindings(handlers)`, `setting()`, `settingsSnapshot()`, three `serialStore`s |
| `socket-adapter.mjs` **new** | adapter | relay.mjs:58, 62, 152–161 · study.mjs:109–112, 127, 2845–2864 | one `game.socket.on`, `onAction(action, fn, {gmOnly})`, `send()`. Uses kit `isActiveGM` (ties-38) |
| `sheet.mjs` **new** | feature | entry :526–691 (`mayView`, `SHEET_TABS`, `injectTab`, `injectOneTab`) + :980–1017 (`injectHeaderButton`, `deleteActor`, the four render hooks) | contributes `edit` |
| `token-hud.mjs` **new** | feature | entry :693–793 (`injectTieHUD`) + :848–876 (scene control, `renderTokenHUD`) | |
| `look-menu.mjs` **new** | feature | entry :878–978 | `document` listeners move here and `uninstall()` removes them |
| `conduit.mjs` **new** | feature | entry :486–505 (socket registration) + :811–846 (`endLookingRun` tempo hooks) | registers the study/relay actions with `socket-adapter`, contributes `study.*` impl |
| `overlay.mjs` | feature | `registerHooks` (:489–518) → `install` | named imports from popups (C15) |
| `worn.mjs` | feature | `registerHooks` (:280–300) → `install` | `readWorn` moves to the adapter and is re-exported here |
| `item-marks.mjs` | feature | `register` (:28–32) → `install` | `MODULE_ID` → `MODULE` |
| `relay.mjs` | domain | `registerRelay` (:150–161) → registration handled by `conduit.mjs` | `requestMirror`/`applyMirror` stay |
| `study.mjs` | domain (barrel) | whole → `export * from "./study/…"` | path kept: documented dynamic import |
| `study/claim.mjs` | domain | study.mjs:146–218, 2091–2127 | `stakeAndConfirm` (ties-39) + three release twins |
| `study/resolve.mjs` | domain | :220–471 | `flagOf` → `readFlag` |
| `study/compose.mjs` | domain | :472–630 | |
| `study/request.mjs` | domain | :631–866 | |
| `study/apply.mjs` | domain | :867–1268 | `throwBlind`, `applyStudy`, belief I/O. Holds the `_mapLegacyRollMode` and `"dice-so-nice"` markers |
| `study/gate.mjs` | domain | :1269–1490 | |
| `study/authoring.mjs` | domain | :1491–1638 | |
| `study/cascade.mjs` | domain | :1639–2090, 2344–2428 | `inspected`, `runCascade`, identification, `grantKind`, resets. `INSPECT_SESSION` (:2092) stays a module-scope `randomID()` |
| `study/tempo.mjs` | domain | :2128–2343 | |
| `study/share.mjs` | domain | :2429–2840 | |
| `study/register.mjs` | domain | :2841–2890 | `studyAs`. Socket registration moves to `conduit.mjs` |
| `attributes.mjs` | domain | unchanged layout. `serial()` (:196–210) → `serialStore` | 1304 lines (C10 warn, §2.3) |
| `facts.mjs` | domain | unchanged | `flagOf` → `readFlag` |
| `known-data.mjs` **new** | domain | known.mjs:89–226 ("Data": `readKnown` wrappers, `addKnown`, `setKnownField`, `hideKnown`, `removeKnown`, `categoriesFor`, `notebookActor`) | so `api.mjs` does not import a UI file |
| `known.mjs` → **`known-ui.mjs`** | ui | known.mjs:1–88, 227–975 | rename, for a role (S12) |
| `look.mjs` → **`look-app.mjs`** | ui | whole | rename |
| `preview.mjs` → **`preview-app.mjs`** | ui | whole | rename |
| `lore.mjs` → **`lore-ui.mjs`** | ui | whole | rename |
| `authoring.mjs` → **`authoring-ui.mjs`** | ui | whole | rename |
| `describe.mjs` → **`describe-dialog.mjs`** | ui | whole minus :150–161 (keybinding → settings rows) | rename. `toggle` is published as `describeCard` (B1) |
| `editor.mjs`, `tie-dialog.mjs`, `attributes-ui.mjs`, `review-ui.mjs`, `popups.mjs` | ui | unchanged | `openTieDialogFor` (entry :702–714) moves into `tie-dialog.mjs` |
| `lang/en.json` | | flat → nested under `PENTARYN_TIES` | |
| `styles/ties.css` | | 56 selectors re-rooted (S11) | |
| `lib/*.mjs`, `lib/kit.lock.json` | lib | vendored, tier full + `election`, `perf` | |
| `test/run.mjs`, `test/kit/*`, `test/*.test.mjs`, `test/golden/*`, `test/fixtures/*`, `test/graph-allow.json` | test | new. `test/known.mjs`, `look.mjs`, `reach.mjs` stay as `LEGACY` until converted | |
| `README.md`, **`CHANGELOG.md`** | docs | README.md:501–529 → CHANGELOG | reorder: 0.19.4 sits above 0.19.3 |

### 2.2 `graph-allow.json` (expected entries, each with a `why`)

Generate the list by running `conformance.py --module ties` after S12, then review it. Expect about
20–25 edges in five groups. Anything outside these groups is a real layering bug, so fix it rather
than allow it.

1. `api.mjs` → domain (`attributes.mjs`, `study.mjs`, `known-data.mjs`, `facts.mjs`). The API
   surface is mostly domain functions. *why:* G1, no domain role.
2. features → domain (`conduit.mjs`→`study.mjs`, `token-hud.mjs`/`look-menu.mjs`→`study.mjs`,
   `sheet.mjs`→`known-data.mjs`). *why:* G1.
3. ui → domain (attributes-ui, review-ui, known-ui, look-app, preview-app, authoring-ui →
   `attributes.mjs`/`study.mjs`/`facts.mjs`). *why:* G1.
4. ui → ui shared widgets (`tie-dialog`→`editor` for `pips`/`stanceSelect`; `look-app`/`preview-app`→`known-ui`
   for `grantCard`/`grantedHead`; `review-ui`→`attributes-ui` for `personalCluesHTML`;
   `editor`→`authoring-ui`; `authoring-ui`/`attributes-ui`→`lore-ui`). *why:* no shared-widget role.
   ties-16/17/18 shrink this group later.
5. ui → domain `relay.mjs` (`tie-dialog`'s dynamic `requestMirror` import, tie-dialog.mjs:646).

### 2.3 Size warnings that remain (accepted)

After S4/S4b/S7/S13 the entry (~140), study (barrel), known-core (barrel) and README are under their caps.
These stay over: `attributes.mjs` 1304, `attributes-ui.mjs` 1044, `known-ui.mjs` ~840,
`preview-app.mjs` 823, `tie-dialog.mjs` 759, `review-ui.mjs` 736, `editor.mjs` 645, `overlay.mjs`
519, `styles/ties.css` 1946. Splitting them is not in any finding. If wanted later, split
`attributes.mjs` along its own section banners (:165, :212, :526, :659, :1011, :1252) and the CSS per
widget (all listed in `styles`, which is a module.json change and therefore a restart batch).

---

## 3. Ordered steps

Rules for every step: one commit each, with tests landing **before** code. The characterisation
diff (`test/golden/*`, `test/*.test.mjs`) is committed by the agent as the checkpoint (review happens at merge). A refactor commit must leave
`git diff --stat -- test/golden test/*.test.mjs` empty. Run `node test/run.mjs`,
`vendor.py check pentaryn-ties` and `conformance.py --module ties` after every step.

### S0 — Re-anchor and score live
- `diff -rq <snapshot>/module/pentaryn-ties foundry/module/pentaryn-ties`. If anything differs, run
  `git log -- foundry/module/pentaryn-ties` and re-derive the line numbers below.
- `./.venv/bin/python scripts/foundry/blueprint/conformance.py --module ties --markdown`. Confirm ties
  is not WAIT.
- Decide **B1b** (§5) before S8 starts.
- Findings: none. Effort 0.5 h.

### S1 — Test runner, vendored kit, shared stubs
- `vendor.py sync pentaryn-ties --tier full --kit election,perf`. `lib/` stays unused until S5.
  The test kit lands in `test/kit/`.
- Add `test/run.mjs` with the fixed body (use-doc §6) and
  `LEGACY = ["test/known.mjs", "test/look.mjs", "test/reach.mjs"]`. The existing suites already
  self-run and `process.exit(main())` (known.mjs last line, look.mjs last line).
- Move the stub world out of test/look.mjs:17–60 (`StubActor`, `game.actors`, settings, i18n via
  `LANG`) into `test/fixtures/stubs.mjs`. look.mjs then imports it unchanged.
- **Characterisation before:** `node test/known.mjs` prints `183 passed` (179 in the snapshot), `node test/look.mjs` prints
  `9 passed`, and `node test/reach.mjs` prints its all-passed summary. After the move, `node test/run.mjs`
  shows the same three outputs and exits 0. Temporarily flip one expectation in known.mjs and
  confirm `run.mjs` exits 1, then revert.
- Absorbs **ties-1** (module side). The `config.py:117` `check=(*_STATIC, "node-test")` edit and the
  `context/foundry/attributes.md:955` wording are §10 future edits, shared with **python-tooling-7**.
- Clears C14, C43, and C39 runner half. Effort 3 h.

### S2 — Characterisation checkpoint (tests and goldens only)
Write against **unchanged** code, run `GOLDEN_UPDATE=1 node test/run.mjs`, then hand off for review
and Joe's approval.

1. **`test/glue.test.mjs`**. Use `installFoundry({ user: GM, users: [GM, P] })`. Extra stubs:
   `globalThis.Actor` (for the `instanceof` in `mayView`), `Macro.create` spy,
   a `document` with `addEventListener`/`createElement`/`body.appendChild`, `canvas = { tokens: {
   placeables: [], hover: null, controlled: [] }, app: { view: fakeEl } }`, `game.keybindings.register/get`,
   `game.socket.on/emit`. `foundry.applications.api.ApplicationV2` already comes from the kit stub.
   - `utilsSource === "foundry"`. Print `foundryBuild`.
   - `fire("init")`: `F.calls` lists `keybindings.register` × 6 in this order: `showWeb` (Digit8),
     `addTie` (Digit6), `fileKnown` (Digit5), `inspect` (Digit4), `showOneTie` (Digit7),
     `showDescription` (Digit9, `restricted: true`). Then `settings.register` × 10 in this order with
     exact configs: `macroCreated`, `playerAccess`, `holdDefault`, `attributes`, `attributeBeliefs`,
     `attributeKnowledge`, `advantageStacking` (choices `raw`/`net` → `PENTARYN_TIES.settings.advantageRaw/Net`),
     `nearDistance` (range 1–20 step 1, default 4), `pinnedCards` (client), `sheetTab` (client).
   - `fire("ready")` as GM: `game.pentaryn.ties` exists. `migrateLegacy`, `repairIcons` and
     `ensureMacro` each run once. `Macro.create` is called with `command: "game.pentaryn.ties.show();"`
     when the macro is absent. The `macroCreated` set is called. `game.socket.on` is called twice on
     `module.pentaryn-ties` (relay first, study second).
   - Make each step throw in turn. The texts are byte-identical:
     `pentaryn-ties | ready step failed: <label>` (5 labels),
     `pentaryn-ties | <reverse-side relay|study conduit> not registered`,
     `pentaryn-ties | sheet injection skipped`, `| tie HUD injection skipped`, `| review control skipped`,
     `| could not clear inspection tempo (scene change|combat started|combat ended|first round)`,
     `| worn HUD injection skipped`, `| item marks`, `| <id> tab injection skipped`,
     `| conduit failed`, `| relayed mirror write failed`.
   - `VERSION`: `module.json.version === "0.19.4"` (C41; re-pointed at `ties-core.VERSION` in S3).
2. **`test/hooks.test.mjs` + `golden/hooks.json`**. `F.hooks` after entry evaluation, in order:
   `once init`, `once ready`, `once ready`, `canvasReady`, `combatStart`, `deleteCombat`,
   `updateCombat`, `getSceneControlButtons`, `renderTokenHUD`, `canvasReady`, `canvasPan`,
   `canvasTearDown`, `deleteActor`, `renderNPCActorSheet`, `renderCharacterActorSheet`,
   `renderActorSheetV2`, `renderActorSheet`. After `fire("init")`, add: overlay `canvasTearDown`,
   `canvasReady`, `canvasPan`, `refreshToken`, `sightRefresh`; worn `renderTokenHUD`,
   `canvasTearDown`, `canvasReady`, `refreshToken`, `deleteToken`, `updateToken`; item-marks
   `renderBaseActorSheet`. Pin the `document` listeners too (`pointerdown` with capture, `keydown`).
3. **`test/api.test.mjs` + `golden/surface-legacy.json`**. Use `surfaceOf(game.pentaryn.ties)` after ready: 95 function
   paths plus `STANCES` (`object`), with names such as `show/showAll/cards → "showAll"`,
   `describe → "toggle"`, `edit → "edit"`. Publish under both load orders: (a) `game.pentaryn`
   absent → created; (b) `game.pentaryn = Object.freeze({ rules: {} })` (the importer) → replaced by
   `{ rules, ties }` and `ties` set.
4. **ties-37 field-drop guards** (tests only, in LEGACY `test/known.mjs` until S4 moves them to
   `core.test.mjs`). (a) `Object.keys(clampAttribute(MAX))` ⊇ `[...ATTR_CONTENT_FIELDS,
   ...ATTR_REVIEW_FIELDS, "id", "bonuses"]`. (b) `clampAttribute`/`readRegistry` are idempotent on MAX.
   (c) `toStoredKnown(readKnown(toStoredKnown([RAW]), {resolve: () => null}))` keeps every key with
   equal values, `imposter` and `hidden` included. (d) only if it holds today: `SNAPSHOT_FIELDS` ⊆
   `ATTR_CONTENT_FIELDS`.
5. **Oracles in `test/fixtures/legacy-*.mjs`**, copied verbatim:
   - `legacy-mirror.mjs`: tie-dialog.mjs:661–688 (`linked`, `resolve`) and relay.mjs:143–145
     (fill-blanks). Cases (ties-12): typed text → `{value: typed, followed: false}`; untouched and
     seeded → `{value: revNow}`; seeded box emptied → `{value: mineNow, followed: true}`; blank box
     with rev = prevMine → followed; blank box with rev diverged → `{value: revNow}`; whitespace-only
     typed. Also `setTie` force-mirror (ties-api.mjs:247–271) pinned as a separate "same name,
     different contract" row.
   - `legacy-miss.mjs`: study.mjs:1346–1351 (`rowMissed`), :1593–1608 (`passOfRow`), :2796–2798
     (`flatMissed`), plus `shareStatus` from known-core. Matrix (ties-13), 12 rows: legacy no-pass with
     total below/at/above dc, `pass: true`, `pass: false`, share `{from, prior}`, `total: null`, dc
     non-number, `rec` null.
   - `legacy-socket.mjs`: run `registerRelay()` and `registerStudy()` with stubbed `apply*`/`showBubble`.
     Dispatch `{action: "mirror-reverse" | "study" | "inspect" | "scope-bubble" | "unknown"}` with
     `isApplyingGM` true and then false, and record the call matrix (ties-38): bubble always, the others
     only for the applying GM, unknown never.
   - `legacy-gm.mjs`: truth table of `isApplyingGM` (relay.mjs:62 = study.mjs:127) over `{user.isGM,
     activeGM?.id}`. It must equal kit `isActiveGM()` row for row (S5).
6. **`test/i18n.test.mjs`**. For each of the 48 template-built keys, render it through its current
   call site (e.g. `stanceLabel(v)` for v ∈ −2..2, the filter/sort/tab buttons' markup) and pin the
   string. Every literal settings and keybinding key exists in `lang/en.json`.
7. **`test/core.test.mjs`** (pre-S3 form). Run `characterise("clamps", …)` over `clampStance`,
   `clampStrength`, `clampNotes`, `clampWord`, `stanceOf` with inputs `[undefined, null, "x", "3",
   1.6, -9, 9, 0, "  word  ", 5000-char string]`. Outputs are pinned as they are, not asserted from memory.

Absorbs **ties-37** (complete), and the "before" halves of **ties-7**, **ties-12**, **ties-13**,
**ties-38** and **ties-45**. Clears C20, C40 and C41 (C28 partly). Effort 14–18 h, the largest single step.

### S3 — `ties-core.mjs` and one `MODULE`
- Create `ties-core.mjs` from ties-api.mjs:14–45 (pure constants and clamps) plus `SHORT`, `NS`,
  `VERSION`, `CONTRACT`, `I18N`, `CSS`, `HOOKS = Object.freeze({})`.
- Add `resolveMirror(box, seeded, mineNow, revNow, prevMine)` and `seedReverse(rev, mine)`, verbatim from
  tie-dialog.mjs:661–688 and relay.mjs:143–145 (ties-12). tie-dialog and relay call them.
- `ties-api.mjs` re-exports these names from `ties-core.mjs`, so no importer changes in this step.
  The entry's `const MODULE = API.MODULE` (:50) → `import { MODULE } from "./ties-core.mjs"`.
  item-marks.mjs:9 `MODULE_ID` → `MODULE` import.
- `core.test.mjs` imports `ties-core.mjs` bare first (purity). It asserts `VERSION === module.json.version`
  and that the S2 clamp golden still matches, plus the S2 mirror oracle.
- Absorbs **ties-12**. Clears C12 and C41. Neutral. Effort 3 h.

### S4 — Split `known-core.mjs` into `core/` behind the barrel
- Before the split, write `golden/known-core-exports.json` = `Object.keys(await import("../known-core.mjs")).sort()`.
- Move the ranges in §2.1. `known-core.mjs` becomes `export * from "./core/known.mjs"; …` (8 lines, with `core/roster.mjs`).
- **Watch the cross-file module-scope initialisers** (TDZ). They must become named imports between core
  files, and the core import graph must stay acyclic: `GRANTED_TEXT_MAX = KNOWN_NOTES_MAX` (:88),
  `LORE_TEXT_MAX = TIER_TEXT_MAX` (:949 → :468), `LORE_DC_DEFAULT = STUDY_BASE_DC` (:959 → :465),
  `IDENT_FLAG = BELIEFS_FLAG` (:1233 → :419). `IDENT_FLAG` is dead (ties-42) but stays until S15.
- In the same commit series, as separate commits:
  - `rolledMiss(rec, dc)` in `core/ledgers.mjs`. The four sites (study.mjs:1346, :1593, :2796,
    known-core :2338, snapshot :2297) call it and keep their own kind/ident/null handling. The S2 matrix proves it (ties-13).
  - `isIdentKey`, `CONCEAL_FLAG = "conceal"`, `INSPECT_CLAIM_KEY = "#inspect"`. Replace the literals at
    study.mjs:1900, 1962, 2012, 2052, 2083, 2096–2117, 2423, attributes-ui.mjs:723, preview.mjs:214,
    authoring.mjs:54–60 (`KIND_OF_FLAG`/`STUDY_TIERS_FLAG`), attributes.mjs:797, known.mjs:659, and the
    bare `"pentaryn-ties"` literal at editor.mjs:84 (→ `MODULE`). The `pentaryn-ties |` console strings at editor.mjs:474/573 and tie-dialog.mjs:589 are log text and go through `log` in S5 (ties-14; its own anchor tie-dialog.mjs:58 is a comment, not a literal).
    Test: `identifiedKey("species:human") === "attr:species:human:#id"`; `isIdentKey` is true for that key
    and false for `"attr:a:r1"` and `"lore:x:#idmiss-a"`; `attrFactKey("a","b") === "attr:a:b"`. A
    `sourceScan` test fails on `` `attr:${ `` or `:${MEMBER_FACT}` outside `core/`.
  - `concealFor(raw, attrId)` holding the clamp from study.mjs:2081–2088 = preview.mjs:213–217.
    Cases (ties-9 part 3): `(8,'x')→8`, `({x:10},'x')→10`, `({default:3},'y')→3`, `(25,'x')→20`,
    `(-4,'x')→0`, `('abc','x')→0`, `(null,'x')→0`, `({x:'7'},'x')→7`.
- Move ties-37 and the known-core cases from LEGACY `test/known.mjs` into `core.test.mjs` when it is
  convenient. It is fine to leave known.mjs in `LEGACY` for now.
- After: the export golden is unchanged, known.mjs still reports 183 passed, and every `core/*.mjs`
  imports only `core/*`.
- Absorbs **ties-36**, **ties-13**, **ties-14**. C10 drops known-core. Neutral. Effort 8 h.

### S4b — Split `study.mjs` into `study/` behind the barrel
- Same method as S4. Before the split write `golden/study-exports.json` =
  `Object.keys(await import("../study.mjs")).sort()` (stubs: `foundry.utils.randomID` is needed at import
  because `INSPECT_SESSION`, study.mjs:2092, runs at module scope). `study.mjs` becomes
  `export * from "./study/…"`. Ranges and the module-private state that moves with each section
  (`SESSION`, `INSPECT_SESSION`, `inspected`, `scoping`) are in §2.1. Cross-file module-scope state must
  stay a single instance, so import it between the `study/*` files rather than copying it.
- `stakeAndConfirm({write, readBack, token, settleMs = 250, sleep})` in `study/claim.mjs` replaces the three
  stake / sleep 250 ms / read-back copies: `claimFact` (study.mjs:159, setting plane), `claimRoll` (:179,
  flag plane) and `claimInspect` (:2094). The three release twins (`releaseFact` :170, `releaseClaim` :212,
  `releaseInspect` :2102) stay. Test with an injected immediate `sleep`: read-back equals the token → true,
  differs → false; `write` is called once and before `readBack` (order spy); for `claimRoll` the update
  payload equals the current literal `{"flags.pentaryn-ties.beliefs.<pc>.<key>": {claim, when}}` with
  `{render: false}` (ties-39).
- After: the export golden is unchanged, `node test/run.mjs` is green, and the modules.py imports gate passes.
- Absorbs **ties-35** and **ties-39**. C10 drops study. Neutral. Effort 8–10 h.

### S5 — Kit idioms in place (no file moves)
Each bullet is its own commit, with the S2 oracle as proof.
- `isApplyingGM` (relay.mjs:62, study.mjs:127) → kit `isActiveGM()`. The `legacy-gm` truth table is
  equal row for row. `isSelf` is `game.userId === this.id`, and `activeGM` is always a GM.
- `flagOf` copies (facts.mjs:23, study.mjs:220, preview.mjs:86, known.mjs:111, attributes.mjs:689) →
  `readFlag(doc, MODULE, key)`. Fixtures: an actor with flags; a doc whose `getFlag` throws (both give
  `undefined`); a synthetic token actor; a key absent.
- The `canSee` copies (overlay.mjs:102, known.mjs:251, popups.mjs:367) → one in `ties-adapter.mjs`
  (created here with only that function). Cases: GM → true; player with `{isVisible:false}` → false;
  `{visible:true}` without `isVisible` → true; `null` → false.
- The hand-rolled `esc` copies → `core/html.mjs`. Before migrating each copy, assert
  `esc(\`<a href="x">'&"</a>\`) === '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&quot;&lt;/a&gt;'` against
  **that file's** current copy. Migrate only the copies that match byte for byte.
- `log`: the entry creates `makeLog(MODULE)`. Every `console.warn/error(\`${MODULE} | …\`, err)` →
  `log.warn/error("…", err)` with the **same text** (S2 pins it). The six comment-only catches (C24) →
  `log.swallow(op, fn, fallback)` with the same fallback each (look.mjs:157 `{}`, :277 `null`,
  preview.mjs:209 `false`, :211 `"raw"`, :731 `null`, review-ui.mjs:481 per site). Add debug lines
  (`log.debug$?.(…)`) at the silent returns named in ties-33 (requestFact ~784, inspect ~1667,
  requestMirror ~73, applyMirror ~96/104/124, runCascade guard exhaustion ~1820, tie-dialog `mirrored`
  ~720), gated by `CONFIG.debug["pentaryn-ties"]` rather than a new client setting. Test: with debug off
  there are no debug lines; with debug on, `requestFact` refused by `mayWrite` emits one line.
  **Open:** where the single `log` instance lives (gap G4).
- Absorbs **ties-15** (minus `t`/`f`, which go in S10, and `settingOr`, which goes in S6), **ties-33**,
  **ties-34**. Clears C24. Neutral, apart from the debug-only lines. Effort 6 h.

### S6 — `settings.mjs`: rows, readers, stores
- `SETTINGS` rows from entry :182–297, with literal keys exactly as today (D4 flat shape):
  `name: "PENTARYN_TIES.settings.playerAccess"`, `hint: "PENTARYN_TIES.settings.playerAccessHint"`, and
  the same pattern for `holdDefault`, `advantageStacking`, `nearDistance` and `sheetTab`.
  `advantageStacking.choices` is passed as the same literal object.
  - `attributes`, `attributeBeliefs`, `attributeKnowledge` → `store: true`. Today's registration is
    exactly `{scope:"world", config:false, type, default}`, which is what the kit registers.
  - `macroCreated` → `store: true` (same registration bytes; a boolean, not a log).
  - `pinnedCards` (client, hidden) → **gap G3**.
- `keybindingRows(handlers)` returns the 6 rows (entry :80–180, describe.mjs:151–160) with literal
  `name`/`hint` and `onDown` taken from `handlers`, because settings.mjs may not import features. The
  entry passes `{ showWeb: () => (Overlay.showAll(), true), … }`, keeping each handler body verbatim,
  including the `mayWrite()` guards and the `inspect` gesture.
- `registerKeybindings()` then `registerSettings()` run in init, in today's order (keybindings first).
- The 29 C21 sites → `setting(key)` or a store's `read()`/`write()`. **Keep each site's failure value:**
  - `mayWrite` (ties-api.mjs:102–110) moves **verbatim** into settings.mjs with its own try/catch → `false`.
    It must **not** use `setting()`, which returns the row default `true` before init.
  - preview.mjs:209/211 and study.mjs:417/426 (fallbacks `false`/`"raw"`) equal the row defaults, so
    `setting()` gives the same answer.
  - overlay.mjs:132 `Number(get) || 4` keeps the `|| 4`.
  - Reads that throw today with no try (overlay.mjs:89, entry :540, :592) are only reachable after
    init. Note the before-init difference in the commit; it is not visible at the table.
  - study.mjs:405 `reg()` returns the unclamped list (ties-19 says it has a different contract from
    `registry()`), so it becomes `stores.registry.read() ?? []`.
- `attributes.mjs` `serial()` (:196–210) → `serialStore(MODULE, REGISTRY_SETTING)`. Semantics: the
  read happens inside the queue and a failure does not block the next write. Test: two concurrent
  `createAttribute` calls both land. The callers' "never nest" rule is kept.
- Absorbs **ties-15** (`settingOr`). Clears C21, C22, C51 (C51 after G3). Neutral. Effort 8 h.
- **ties-30** (put `setKnowledge`/`clearKnowledge`/the attr branch of `putBelief` through
  `serialStore`) is the natural next commit, but it is **[declared]** (§5 B5) and listed as standalone.

### S7 — Decompose the entry into features
- Create `sheet.mjs`, `token-hud.mjs`, `look-menu.mjs`, `conduit.mjs` and `socket-adapter.mjs` from the
  ranges in §2.1. Each feature gets `export function install(reg, ctx)` / `export function uninstall()`.
- `overlay.mjs`, `worn.mjs`, `item-marks.mjs`: `registerHooks`/`register` → `install(reg, ctx)`, whose
  body is `reg.once("init", () => { …today's body via reg.on… })`. These hooks are registered
  **during init** today, so this keeps their position in `golden/hooks.json`. `overlay.install` keeps
  `Cards.setOnChange(drawWires)` (:493) as its first line. Add `// hot: state.wires` and
  `// hot: state.badges` comments on the `refreshToken`/`sightRefresh` handlers (C49).
- The entry body calls `sheet`, `tokenHud`, `lookMenu`, `conduit`, `overlay`, `worn` and `itemMarks`
  `install(reg, ctx)` **synchronously**, in the order that reproduces `golden/hooks.json`. Migrating
  modules keep install synchronous (use-doc §6).
- `socket-adapter.mjs` (ties-38): one `game.socket.on(CHANNEL)`. `conduit.install` registers
  `MIRROR` (gmOnly), `STUDY`/`INSPECT` (gmOnly) and `BUBBLE` (gmOnly: false) at `ready`, in the same
  try/catch isolation and with the same error texts. **Proof:** the S2 `legacy-socket` matrix is equal.
  `F.calls` now shows **one** `socket.on` instead of two. This is the only expected F.calls delta, so
  update the glue pin in the characterisation commit for this step and say so in it.
- `openTieDialogFor` → `tie-dialog.mjs`. `inspectorFor` → `ties-adapter.mjs`.
- `reg.on` guards: handlers that already have their own try/catch keep it (the texts are pinned).
  Handlers with none today (overlay ×5, worn ×5, look-menu `canvasPan`/`canvasTearDown`, `deleteActor`,
  the dblclick `canvasReady`) are registered with `{ guard: false }` so their failure path stays
  Foundry's own "Error thrown in hooked function". Switching them to `guard: true` is **[declared]**
  B9 (console-only).
- Entry `import * as` becomes named imports for non-features (C15). overlay.mjs:46
  `import * as Cards` → named.
- `uninstall()` test: after `uninstall()`, `F.hooks` has no ties listener and the `document`
  listeners are removed.
- Absorbs **ties-38**, and **ties-45** (the "map" half; the README table lands in S13). Clears C15,
  C17 (kept), C18. C10 drops the entry. Neutral (B9 deferred). Effort 12–14 h.

### S8 — `api-manifest.mjs`, `api.mjs`, `buildApi`
- **Needs B1b decided.** `buildApi` throws on `describe`, `attributes.describe` and `study.inspect`.
- `api-manifest.mjs`: one row per existing path (§2.1, ~96). Rules:
  - Legacy shapes → `legacy: true`, with `returns` copied from today's comments (e.g. `read` "never
    throws, [] on miss"; `known.add` "null if already filed"; attribute writes `{ok, reason?, …}`).
  - Actor-taking **reads** (`read`, `inbound`, `known.read`, `attributes.of/ids/known/broken`,
    `study.beliefs/state/lore`) take `params[0] = {name: "ref", kind: "actor", resolve: false}`. Their
    impl calls `resolveRef(ref, "actor", {base: true, required: false}) ?? ref` (gap G5: the kit has no
    per-row `base` default, and ties must always use the world actor; ties-api.mjs:53–64). Documents
    pass through unchanged. Strings and tokens, which returned `[]` or threw before, now resolve
    (ties-4, additive). **Writes stay unresolved.**
  - `STANCES` is not a function: publish it through `unlisted: ["STANCES"]`. `buildApi` freezes it
    in place (`freezeDeep`), which freezes the module's own `STANCES` array. Check that nothing mutates
    it, or publish a copy (gap G7).
  - Additive rows, in a separate commit after the neutral one: `inspect(ref, opts)` = the ties-3
    dossier (`toPlain`, depth ≤ 4, GM-plane parts gated as in ties-3); `selftest()`;
    `attributes.effective` / `attributes.ofEffective` (ties-5); `attributes.tree/branch/describeId`,
    `study.factStatus/shareFact/forgetFact/identified` (ties-6).
- Impl sources: `api.mjs` imports adapter, settings and domain functions (graph-allow group 1).
  Features contribute UI-owned impl only through `install()` return values `{rows: [], impl}`.
  Overlay contributes `show/showAll/showOne/cards/clear/closeAllCards`. Sheet contributes `edit` and
  `known.picker/open`. Worn contributes `wornDialog`. Tie-dialog's `addTie` is contributed by
  `token-hud`, and so on. Rows stay in `api-manifest.mjs` so `describe()` is complete offline.
- **Goldens:** `golden/surface.json` and `golden/describe.json` are **new** files (not edits of an S2
  golden). `api.test.mjs` asserts that every `surface-legacy.json` path survives with the same
  `fn.name`, except the declared B1/B1b paths. The new kit members are exactly `describe`, `version`,
  `contract`, `settings`, `trace`, `uninstall`, `inspect`, `selftest`. `normaliseDescribe(describe())`
  equals the golden. `inspect(CAVEN)` has depth ≤ 4 and returns refs only. `resolveRef` table:
  `"Caven Ashwell"` → actor; `"caven ashwell"` → actor; `"Cav"` → NOT_FOUND (no substring); token
  → base actor.
- Absorbs **ties-7**, **ties-3**, **ties-4**, **ties-5**, **ties-6**. Clears C27, C28, C48 (via
  buildApi), C29 (real). Effort 12–14 h.

### S9 — Publish through the kit
- Replace entry :461–466 (the frozen-root guard) and the `publishAPI` step with
  `buildApiFor(ctx)` **first**, then `publishNamespace("ties", api, {moduleId: MODULE})`. The default
  `when: "ready"` is correct: today's publish runs synchronously inside the ready handler before its
  first `await` (:471–479).
- Test: the S2 two-load-order cases still pass. `game.modules.get("pentaryn-ties").api === game.pentaryn.ties`.
  `pentaryn-ties.ready` and `pentaryn.ready` fire once.
- Clears C50. Neutral (adds the canonical `module.api` and the two ready events). Effort 2 h.

### S10 — i18n: literals, nesting, hard-coded English
- First, change the test stubs (test/fixtures/stubs.mjs, ex look.mjs:21) to read `lang/en.json`
  through `foundry.utils.flattenObject`, so nesting does not break them.
- Per file, replace `t(k)`/`f(k, d)` (14 copies: describe:30, authoring:39–40, attributes-ui:50–51,
  attributes:73–74, editor:38–39, lore:47–48, known:58–59, overlay:55, look:78–79, preview:92–93,
  tie-dialog:34–35, review-ui:54–55, worn:39, study:121–122) with `_loc("PENTARYN_TIES.full.key", data)`.
  describe.mjs:30's `|| d` fallback stays at each call site.
- The 48 template-built keys → literal maps in the owning file, e.g.
  `const STANCE_KEY = { "-2": "PENTARYN_TIES.stance.hostile", … }`. The S2 i18n test proves the strings are unchanged.
- ties-44: move the hard-coded English (entry :755–756, attributes-ui ~187/190/767, review-ui
  ~340–341/392, preview ~108/115/140/344–420/502) into new keys whose values are the **exact** current
  text, including interpolation. Snapshot `chainTags(row)` and the review row markup before and after.
- Nest `lang/en.json` under one `PENTARYN_TIES` root (mechanical; no leaf/prefix clash today). This is
  reload-only.
- Absorbs **ties-44**. Clears C34, C35, C36. Neutral. Effort 10 h.

### S11 — CSS scoping (C37)
- Add a second class next to each existing window class (no removal): `pt-tie-dialog` where
  `pentaryn-tie-dialog` is used (known.mjs:955, tie-dialog.mjs:193, study.mjs:661, 1514),
  `pt-inspect-preview` (preview.mjs:107), and `pt-cards` on the layer element (popups.mjs:72–75).
- Rewrite the 56 selectors: `.pentaryn-tie-dialog X` → `.pt-tie-dialog X` and
  `.pentaryn-inspect-preview X` → `.pt-inspect-preview X` (same specificity: one class for one
  class). `#pentaryn-ties-cards` → `#pentaryn-ties-cards.pt-cards` (higher specificity, no competing id rule).
- Clears C37 (with S14's `cssPrefix`). Rendering should be identical, but this goes to the live check
  as B8. Effort 3 h.

### S12 — Role renames and `graph-allow.json`
- `git mv` known.mjs → known-ui.mjs (after splitting known-data.mjs out of :89–226), look.mjs →
  look-app.mjs, preview.mjs → preview-app.mjs, lore.mjs → lore-ui.mjs, authoring.mjs →
  authoring-ui.mjs, describe.mjs → describe-dialog.mjs. Update the imports, including
  `test/look.mjs`, `test/fixtures/stubs.mjs` and the dynamic imports at known.mjs:221 and editor.mjs:471/570.
- `readWorn` → `ties-adapter.mjs` (so popups, a ui file, does not import worn, a feature).
- Write `test/graph-allow.json` from the post-move scorer output (§2.2), with one `why` per edge.
- Proof: the S2 goldens are unchanged. The modules.py imports gate passes. `conformance.py`: C05, C15, C16 pass.
- Absorbs **ties-45** (the import-graph check is now C16 plus the allow-list). Clears C16. Neutral.
  The renamed URLs are not part of any documented import path (only known-core.mjs and study.mjs
  are; checked in `context/`). Effort 4 h.

### S13 — README, CHANGELOG, API reference
- README.md (529 lines at 4e64f47) → the use-doc §7 section order, ≲ 250 lines. "What a tie is", "Using it", "On the
  canvas" and "What a player can and cannot see" → **What the player sees**. Settings table.
  **API** = a pointer to `game.pentaryn.ties.describe()` / `test/golden/describe.json`, plus the
  ten most-used calls. **Data written**: `flags.pentaryn-ties.{ties, known, knownCategories, granted,
  studied, beliefs, kindOf, studyTiers, studyHold, studyOffset, lore, attributes, attributesOff,
  conceal, worn, mark}` and the three world stores. **Flags other modules read**: none. **Events**:
  none emitted, plus the listened hooks from golden/hooks.json. **Patches and adjustments**: the three
  rows plus the new item-piles row. **Two sessions**: the claim protocol (`stakeAndConfirm`) and
  `isActiveGM`. **Extending**: the sheet-tab spec, socket `onAction`, manifest row. **Pitfalls**:
  unlinked tokens → base actor; never nest serial writes; `-=` vs `_del`. **Files**: the §2.1 table
  with roles (ties-45 README part). **Tests**. **Sync**.
- README.md:501–529 (0.19.1–0.19.4; 0.19.4 currently sits above 0.19.3, put it back in order) and the version-tagged headings → `CHANGELOG.md`.
- The design-history prose ("Design notes" :394–433, dated sections) moves to a context plan, never
  into the module folder.
- Fix the drifted comments named in ties-43 (study.mjs:1549 `study.setTiers` → `tiers`; known.mjs:9–12
  "phases 3–5 not here yet"; the orphaned attributes.mjs:347–353 JSDoc; lore.mjs:241 vs known-core
  :1026–1031). Add a doc test: every `game.pentaryn.ties.<path>` and `A.`/`S.` call in README.md and
  `context/foundry/attributes.md` must exist in `describe().methods` (this would have caught `setTiers`).
  The fix to attributes.md itself is a `context/` edit for the docs pass.
- Absorbs **ties-43**. Clears C44 and C45. Effort 6 h.

### S14 — Batch hand-offs (no module code)
Listed here so the batches pick them up. Do not make these edits from this guide.
- **Wave 7 restart batch** (`module.json`): `compatibility: {minimum: "14", verified: "14.369"}`.
  `flags.pentaryn = {tier: "full", namespace: "ties", flagScope: "pentaryn-ties", cssPrefix: "pt-",
  generation: 14, afterSync: [...]}`. This corrects the manifest field only; no data migration (G6).
  `relationships.recommends`: `item-piles` (reason: "double-click look menu skips item-pile tokens;
  inspect preview excludes pile actors") and `dice-so-nice` (reason: "blind study rolls set
  flags.dice-so-nice.skip"). Clears C02, C07, C09, and C38 then applies (and passes).
- **adjustments.yml batch**: a new row `ties-item-piles-pile-check` (package `item-piles`, files
  `look-menu.mjs`, `preview-app.mjs`, markers `"item-piles", "data"` and `isValidItemPile`,
  `check: make foundry-ties-check`) clears C47. Update `files` on `core-ties-flag-wipe`
  (known-core.mjs → `core/known.mjs` + whichever core file holds the `ForcedDeletion` comment;
  look.mjs → look-app.mjs; preview.mjs → preview-app.mjs), `dsn-skip-blind-study` (→
  `study/apply.mjs`) and the **ties path only** of `dnd5e-legacy-roll-modes` (→ `study/apply.mjs`; see §6).
- **§10 gate edit**: `scripts/foundry/ops/config.py:117` → `check=(*_STATIC, "node-test")` clears C39
  (ties-1 / python-tooling-7).

### S15 — Standalone findings
See §4. They can start as soon as their prerequisite step has landed.

---

## 4. Findings that are not structural (standalone fixes)

Each keeps its own `behaviourTest` from the audit and is a separate commit after the named step.
"After" is the earliest safe point.

| Finding | What | After | Kind |
|---|---|---|---|
| ties-8 | `knowsAbout(character, subject)` out of `LookWindow.shownGroups` (look.mjs:153–184) into facts.mjs; publish `study.knowsAbout` | S8, S12 | additive API; byte-identical Look HTML |
| ties-9 (parts 1, 2, 4) | `markLearned` (attributes-ui.mjs:713–733 → attributes.mjs), `writeLoreRows` (authoring.mjs:158–167), publish `attributes.markLearned`, `study.loreRows/setLoreRows/setConceal`. Part 3 (`concealFor`) is done in S4 | S8 | additive API |
| ties-10 | `whenMs`/`deliveredMs` beside the locale strings in `pending()` (study.mjs:1415, 1455) and `beliefs()` (:1627–1628) | S8 | additive return keys |
| ties-16 | `row-ui` toggle binding ×6 and open-state maps ×4. Lands as a ui helper; shrinks graph-allow group 4 if the helper is pure enough for `core/html.mjs` | S12 | neutral |
| ties-17 | delete `grantedBlock` (attributes-ui.mjs:115–136) in favour of `grantedRegion` | S12 | neutral (whitespace-normalised) |
| ties-18 | `notesPreview`/`notesProse`/`wordCell` | ties-16 | neutral, byte snapshot |
| ties-19 | memoise the clamped registry, `describeAttribute(id, byId)` | S6 | perf; neutral (structuredClone on return) |
| ties-20 | `planStep` normalises once | S4 | perf; idempotence fixtures first |
| ties-21 | hoist loop invariants in `runCascade` (study.mjs:1821) | S4/S5 split | perf; neutral |
| ties-22 | `inbound` once per paint (editor.mjs:342/425) | S12 | perf; neutral |
| ties-23 | `registryOf()` hoisted in `buildKnownHTML` (known.mjs:658) | S12 | perf; neutral |
| ties-24 | worn badges: players skip the rAF, `badgePlan` pure, diff | S7 | perf; item 1 is [declared-lite] (§5 B7) |
| ties-25 | `drawWires` early return with no cards (overlay.mjs:186) | S7 | perf; neutral |
| ties-26 | per-dispatch dedupe of the four sheet render hooks (sheet.mjs) | S7 | perf; live check B7 |
| ties-27 | `personalCluesHTML(entry, carriersOf)` (attributes-ui.mjs:303) | S12 | perf; neutral |
| ties-28 | one pass in `kindPicker` (authoring.mjs:53–82) with the core flag constants | S4 | perf; neutral |
| ties-29 | `rollModeBlind()` before `claimFact`; release the claim on throw (study.mjs:906, ~964, ~1022) | S4 | **[declared]** B4 |
| ties-30 | serialise `setKnowledge`/`clearKnowledge`/the attr branch of `putBelief` through `serialStore` | S6 | **[declared]** B5 |
| ties-31 | prune `inspected` on `deleteCombat`; `forgetAttributesActor`/`forgetLoreKey`/clear `shownHidden` on `deleteActor`. This is use-doc §5.4, done through the features' `reg.on` | S7 | neutral (unobservable) |
| ties-32 | escape `art` in describe-dialog (describe.mjs:91); item-mark icon must match `/^fa-[a-z0-9-]+$/` (item-marks.mjs:21) | S5 | **[declared]** B6 |
| ties-46 | preview's `watch()` also hooks `updateUser` (`character`/`role`) and character `ownership.*` changes, so the U-7-3 roster refreshes (preview.mjs:165, :718–757) | with ties-40 (S12), or before | [declared-lite]: share row updates live when a player picks a character |
| ties-40 | `LiveHooks` for the Look and preview windows. Use a kit `hookRegistry` per window (`reg.on`/`offAll`), keep `LIVE_MS = 150` and preview's `full` flag | S12 | neutral |
| ties-41 | `mount()` shared by `show()`/`restorePinned()` (popups.mjs:247–271, 371–392) | S5 (canSee) | neutral |
| ties-42 | delete dead exports (attributes `knowsOf`, `hasFailed`, `hasAttributes`, `knowsIncludingCarried`; overlay `isShowing`; known-core `rungsFor`, `IDENT_FLAG`; authoring `hasLore`; ties-api `STRENGTHS`, `candidates`) and 5 dead CSS rules. `branchOf` is published in S8 (ties-6) instead | S8 (surface golden in place) | neutral for the API. A removed export from `known-core.mjs`/`study.mjs` breaks console imports, so keep one-release re-exports for those two barrels |

Cross-addon companions (not ties ids, same work): **python-tooling-7** (the S14 gate edit) and
**mcp-fork-20** (the `game.pentaryn` index generated from `golden/describe.json`).

---

## 5. Declared behaviour changes (live-test workflow)

Tag each one `[declared]` in its commit and give its golden update its own commit. Do not merge
until the live-test run reports on it.

| # | Change | Step | How to see it at the table |
|---|---|---|---|
| **B1** (spec B1) | `ties.describe` → `ties.describeCard` (`describe-dialog.toggle`). `ties.describe()` now returns the manifest. The old card path gets a `logCompatibilityWarning` shim on `describeCard` only, because the old name cannot keep both meanings | S8 | key 9 still toggles the card; a macro calling `game.pentaryn.ties.describe()` gets JSON instead of the card |
| **B1b** (new, **decision needed**) | `attributes.describe` (`describeRef`, documented 3× in attributes.md:200/437/593) and `study.inspect` (the inspect gesture) also hit kit `RESERVED`. The kit refuses reserved names **at any depth**, so `buildApi` throws. **Option A (recommended):** relax `reservedClash` in `foundry/lib/api.mjs` to the top level only. Nested paths cannot clobber a kit member, so both paths keep working; this is a kit bump to 1.0.1 and the re-vendor needs only a reload. **Option B:** rename them to `attributes.lookup` and `study.examine`, with no shim possible (the old names stay reserved), and update attributes.md | S8 | A: none. B: console macros using `A.describe(…)` break |
| B2 | ties-4: string and token refs to the read rows now resolve, to the **base** actor | S8 | `game.pentaryn.ties.read("Caven Ashwell")` returns ties instead of `[]` |
| B3 | ties-3/-5/-6/-8/-9/-10: new API paths and return keys (additive) | S8, S15 | none at the table; `describe()` lists them |
| B4 | ties-29: a missing `Roll._mapLegacyRollMode` refuses the study cleanly, and a throw after `claimFact` releases the claim | S15 | only on a core that drops the private API. Force a throw in `rollSkill`; the fact is studyable again with no GM reset |
| B5 | ties-30: knowledge and attr-belief writes are serialised. A player-client write now returns `null` instead of the server refusing it | S15 | two shares to different PCs in the same second both land |
| B6 | ties-32: escaped description art; non-`fa-` item-mark icons fall back to `fa-fire`. Grep world items for non-`fa` `mark.icon` first | S15 | a mark with a bad icon shows a flame |
| B7 | ties-24 item 1 (players no longer schedule badge frames) and ties-26 (sheet injection once per render) | S15 | the worn badge still shows for the GM; each of the three tabs appears once on character, NPC and V2 sheets, also after a re-render while a ties tab is active |
| B8 | S11 CSS re-rooting and S10 lang nesting. Intended to be identical | S10, S11 | open the tie dialog, the inspect preview and the cards with a pinned card. No raw `PENTARYN_TIES.` keys anywhere |
| B9 | `guard: true` on the hooks that are unguarded today: the failure line changes from Foundry's text to `pentaryn-ties | <label>` (console only, which is fine at Joe's table) | after S7 | console only |
| B10 | `pinnedCards` gains `name`/`hint` (gap G3, if resolved by adding labels) | S6 | none (config:false) |
| — | **Not declared** (spec B3 does not apply): ties keeps synchronous `install()`, and hook order is pinned unchanged | S7 | — |

---

## 6. WAIT flag

**WAIT: no.** `pentaryn-ties` is not in `scripts/foundry/blueprint/wait.json`. A grep of the snapshot
finds no import of, flag read from, hook from or API call into `pentaryn-combat`, `-transform` or
`-aoe`. Nothing outside ties references `game.pentaryn.ties` or `pentaryn-ties` flags except a
README sentence in creatures. Two caveats:

1. The adjustments row `dnd5e-legacy-roll-modes` is **shared with `pentaryn-aoe`** (WAIT). Its
   `files` list both aoe paths and `study.mjs`, and its `check` runs
   `make foundry-aoe-check foundry-ties-check`. When S4b moves `study.mjs` → `study/apply.mjs`, edit
   **only the ties path** in that row, inside the single adjustments batch. If the aoe half of that
   check fails while aoe is in flux, report it rather than "fixing" aoe.
2. The live tree matched the snapshot on 2026-10-10. Ties is not WAIT, so another workflow could still
   edit it. Re-run S0 before each session.

---

## 7. Effort

| Step | Hours |
|---|---|
| S0 re-anchor | 0.5 |
| S1 runner, kit, stubs | 3 |
| S2 characterisation (glue/hooks/api/i18n/core + oracles) | 14–18 |
| S3 ties-core | 3 |
| S4 core split (+ ties-13/14, concealFor) | 8 |
| S4b study split + `stakeAndConfirm` (ties-35/39) | 8–10 |
| S5 kit idioms (gm, flags, canSee, esc, log) | 6 |
| S6 settings.mjs | 8 |
| S7 features | 12–14 |
| S8 manifest + api | 12–14 |
| S9 publish | 2 |
| S10 i18n | 10 |
| S11 CSS | 3 |
| S12 renames + graph-allow | 4 |
| S13 docs | 6 |
| **Structural total** | **≈ 93–110 h** |
| S15 standalone (23 findings; perf ones S, the rest S–M) | 30–40 |
| Live-test hand-offs B1–B10 | 1 table session |

The critical path is S2 → S3 → S4 → S4b → S6 → S7 → S8. S10, S11 and S13 can run in parallel with S7/S8
once S5 has landed, as long as they stay out of the same files in the same commit.

---

## 8. Blueprint gaps found while planning ties (for the blueprint owner)

| Gap | Problem | Suggested fix |
|---|---|---|
| **G1** | There is no role for Foundry-aware, non-UI logic ("domain": `attributes.mjs`, `study/*`, `facts.mjs`, `known-data.mjs`). They score as `glue`, and every feature/ui/api → glue edge fails C16, so ties needs about 20–25 graph-allow entries | add a `domain` role (`domain/` folder or a `-domain.mjs` suffix) that may import adapter, core, settings, lib and domain, and is importable by api/feature/ui |
| **G2** | `reservedClash` rejects reserved words at **any** depth (api.mjs:31–37), but C48 only scans top-level published keys. Ties has `attributes.describe` and `study.inspect` | relax the kit to the top level (B1b option A), or extend C48 to nested keys so the scorer and the kit agree |
| **G3** | A hidden **client** setting (`pinnedCards`) can be neither a `store` row (forced to world scope) nor C51-compliant without inventing labels | a `labels: false` row flag that registers with no name/hint and is exempt from C51 |
| **G4** | "One `log` per module", but domain and ui files that are not features have no `ctx`. Calling `makeLog(MODULE)` per file splits `warnOnce` and the trace ring | memoise `makeLog` per moduleId in the kit, so every file's `makeLog(MODULE)` returns the same instance |
| **G5** | `bind()` takes `base` only from the call's opts. Ties must resolve tokens to the **world** actor by default | an optional `params[0].base` row default |
| **G6** | C07's detail calls ties' `flagScope: "ties"` a Wave 7 data migration. The data already lives under `pentaryn-ties`, so only the manifest field is wrong | scorer: say "data migration" only when the code's flag scope ≠ module id (aoe, walls) |
| **G7** | `buildApi`'s `freezeDeep` freezes non-function members published through `unlisted` (the caller's own objects) | freeze a structured clone, or document it |

## Result (fill when done)

| | |
|---|---|
| Live score after the migration | ___ % (___ / ___ fail-class rules) — `conformance.py --module ties --markdown` |
| Date | ____-__-__ |
| Commits (Joe-approved) | characterisation: ______ · refactor: ______ · standalone: ______ |
| Declared changes handed to the live-test workflow | ______ (session L__) |
| `module.json` edits appended to `wave7-restart-batch.md` | yes / no |
| Adjustments rows appended to `adjustments-batch.md` | yes / no |
| Still failing, and why | ______ |
