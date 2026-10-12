---
title: "Final review 2026-10-12 — kit"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of kit found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — kit

## Verdict

**NEEDS-JOE.** The seven kept changes are test-only and the gate is green. Under the kit rule, every source fix was recorded rather than made, and several of those are real promise breaks: `unwrapAll` loses live patch records, relay rows never receive `ctx.user`, `coalesce` can re-enter, the legacy-hook warning repeats, and the test stub's `preDelete`/`activeGM` differ from Foundry.

## Scope

- Paths: `foundry/lib/**` (the vendored kit). The only edits were new tests under `foundry/lib/test/`, plus this record. Kit source was not changed (`kit_source_changes=false`).
- Base: `4b75feeb` (origin/main when the review started).
- Branch: `review/kit`, worktree `pentaryn-review-kit-wt`.
- Triage: 47 findings. 10 were dropped as duplicates, leaving 37: 7 DO-REFACTOR (all test-only additions that pass today) and 30 RECORD.

## Findings by lens

Line numbers are at the review HEAD. All paths are under `foundry/lib/`.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| KIT-M1 | api.mjs:207 | low | DO-REFACTOR, kept | describe().queries and registerQueries derive query names with separate copies of the formula |
| KIT-M6 | kit.json | low | DO-REFACTOR, kept | Nothing checked that kit.json deps cover every kit import |
| kit-ext-8 | kit.json, errors.mjs | low | DO-REFACTOR, kept | kit.json version, KIT_VERSION, file headers and the README table could drift apart |
| kit-ext-3 | api.mjs, errors.mjs | low | DO-REFACTOR, kept | RESERVED names and buildApi's wiring could drift apart |
| KIT-M8 | api.mjs, test-kit/harness.mjs | low | DO-REFACTOR, kept | maxDepth is copied in the kit and the harness |
| KIT-M11 | settings.mjs:59 | low | DO-REFACTOR, kept | No test covered filePicker being forwarded to register |
| KIT-M10 | publish.mjs:25 | low | DO-REFACTOR, kept | publishedOf's real shape `{when, at, module, alias}` was not pinned |
| KIT-R1 | patch.mjs:139 | medium | RECORD | unwrapAll drops a patch's record even when a foreign wrapper keeps it live |
| AC-1 | queries.mjs:67 | medium | RECORD | Relay rows never receive ctx, so ctx.user is lost |
| kit-ext-1 | api.mjs:207 | medium | RECORD | extras.queries replaces the row-derived list instead of adding to it |
| kit-edge-2 | test-kit/foundry-stub.mjs:240 | medium | RECORD | The stub's doc.delete() never fires the vetoable preDelete hook |
| KIT-M2 | README.md:32 | medium | RECORD | The docs say resolve is "exact match only", but byName has a case-insensitive fallback |
| kit-ext-2 | hooks.mjs:128 | low | RECORD | With no log, the overdue-legacy warning fires on every emit instead of once |
| kit-edge-3 | test-kit/foundry-stub.mjs:452 | low | RECORD | The stub's activeGM ignores role, unlike Foundry |
| kit-edge-4 | perf.mjs:41 | low | RECORD | A re-entrant coalesce call starts a second run |
| KIT-R2 | publish.mjs:87 | low | RECORD | inspect(ref, null) throws an uncoded TypeError |
| KIT-R3 | election.mjs:61 | low | RECORD | claimDocument/claimMessage reject uncoded on an update failure and return true for a null doc |
| KIT-R4 | settings.mjs:185 | low | RECORD | A partial multi-key serialStore mutate writes undefined to the omitted keys |
| AC-6 | settings.mjs:185 | low | RECORD | A multi-key serialStore write is not atomic |
| KIT-R5 | resolve.mjs:102 | low | RECORD | An unloaded compendium UUID gives a misleading BAD_ARGS |
| KIT-R6 | argon-kit.mjs:67 | low | RECORD | applyButtons fires b.render() unawaited and with no catch |
| KIT-R7 | queries.mjs:97 | low | RECORD | A remote queryGM failure is uncoded, and TIMEOUT is never produced |
| kit-edge-8 | log.mjs:83 | low | RECORD | log.notify drops the console line when ui.notifications is missing |
| KIT-M3 | README.md:43 | low | RECORD | The argon-tooltip.css README row describes the migration as finished |
| KIT-M9 | README.md:44 | low | RECORD | The README export lists leave out stubId and sourceFiles |
| KIT-M4 | api.mjs:60 | low | RECORD | buildApi/bind cannot take an injected `g` |
| KIT-M5 | test-kit/foundry-stub.mjs:343 | low | RECORD | installFoundry is one function of about 280 lines |
| KIT-M7 | errors.mjs:65 | low | RECORD | isCoded, withRef and installRoot have no outside consumers |
| kit-ext-5 | api.mjs:197 | low | RECORD | describe()'s optional fields are hand-written spreads |
| kit-ext-6 | resolve.mjs:14 | low | RECORD | Ref kinds are spread over three parallel tables, and unknown kinds are not checked at build |
| kit-ext-7 | test-kit/foundry-stub.mjs:529 | low | RECORD | The stub covers fewer collection kinds than resolve.mjs |
| kit-ext-9 | settings.mjs:59 | low | RECORD | defineSettings silently drops SettingConfig keys outside its allowlist |
| AC-4 | queries.mjs:92 | low | RECORD | queryGM's timeout bounds only the remote path |
| AC-5 | queries.mjs:69 | low | RECORD | An unpublished GM tab's NOT_READY answer can beat a ready tab's answer |
| kit-perf-2 | perf.mjs:16 | low | RECORD | memo evicts FIFO and holds keys strongly |
| kit-perf-3 | perf.mjs:37 | low | RECORD | Blueprint §5.5 recommends the leading-edge coalesce for rebuilds |
| kit-perf-4 | settings.mjs:81 | low | RECORD | settingReader constructs a Setting on every client-scope get |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 65441ba0 | KIT-M1: guard that describe().queries matches the names registerQueries registers | `test/queries.test.mjs`: "describe().queries equals the names registerQueries registers" |
| 2c8361b6 | KIT-M6: guard that kit.json deps close over every kit import | `test/kit-json.test.mjs`: "kit.json deps close over every kit import" (mutation-checked) |
| daf43fe8 | kit-ext-8: guard that the kit version, KIT_VERSION, headers and README rows agree | `test/kit-json.test.mjs`: "kit version, KIT_VERSION and every header agree" (mutation-checked) |
| 8763e2f2 | kit-ext-3: guard that every RESERVED name is refused as a row and wired on the API | `test/api.test.mjs`: "every RESERVED name is refused as a row and wired on the built API" |
| d4a39484 | KIT-M8: guard that the kit and harness copies of maxDepth stay identical | `test/api.test.mjs`: "kit and harness maxDepth stay identical" |
| e49499a7 | KIT-M11: pin that filePicker is forwarded to register | `test/settings.test.mjs`: "defineSettings forwards filePicker to register" |
| 77f998f5 | KIT-M10: pin the shape publishedOf returns | `test/publish.test.mjs`: "publishedOf returns when/at/module/alias (the shape modules put in describe().published)" |

## Changes reverted by verification

None.

## Recorded for Joe

All of these are kit-source changes for the next kit bump. A change to `foundry/lib` must be re-vendored into every module.

- **defect** `patch.mjs:139` (KIT-R1): `unwrapAll()` does `records.splice(0)` before unwrapping. If a foreign wrapper makes undo return false, the patch stays live but its record is lost, which contradicts patch.mjs:18-22, and re-wrapping with the same marker double-stacks it (live caller: pentaryn-pings/capture.mjs:123). Fix: `for (const r of [...records].reverse()) r.handle.unwrap();`, plus the test planned for patch.test.mjs.
- **defect** `queries.mjs:67` (AC-1): the registerQueries handler drops `ctx`, so `relay:true` API functions never see `ctx.user`. That breaks relayed()'s `fn(data, ctx)` promise and the §5.9.4 rule that relayed handlers check ctx.user. Fix: `async (data = {}, ctx) =>`, passing ctx as a trailing argument for relay rows only.
- **defect** `hooks.mjs:128` (kit-ext-2): with no log, the emitter's overdue-legacy warning goes to console.warn on every emit, although hooks.mjs:112-113 says "warns once". This is latent, since every caller passes a log. Fix: guard it with a closure-local `warned` Set, and later move the four hand-copied fallbacks into one helper.
- **defect** `perf.mjs:41` (kit-edge-4): coalesce sets `inflight` after fn's synchronous prefix has run, so a re-entrant call starts a second run, and the inner run's `.finally` clears `inflight` early. That breaks "one run at a time". It is latent, with no consumer. Fix: set a deferred before calling fn, and clear only `if (inflight === run)`.
- **defect** `test-kit/foundry-stub.mjs:240` (kit-edge-2): the stub's `doc.delete()` never fires `preDelete<Doc>`, contrary to its comment at :192 and to Foundry, so a preDelete veto (dropbin ledger.mjs:128) cannot be tested. The fix may shift module F.calls goldens.
- **defect** `test-kit/foundry-stub.mjs:452` (kit-edge-3): the stub's activeGM sorts by id only, while Foundry sorts by role first. Fix: sort by `(b.role ?? 0) - (a.role ?? 0) || a.id.localeCompare(b.id)`.
- `api.mjs:207` (kit-ext-1): `extras.queries` replaces the row-derived list instead of adding to it, so Journal's hand-registered relay query is missing from its describe().queries. Decide between a manifest query table and merging the lists. Either changes the describe goldens.
- `api.mjs:207` (from KIT-M1): describe() has its own inline copy of `queryNameOf`. Move `queryNameOf`/`isRefRow` into api.mjs and import them from queries.mjs, which avoids a circular import.
- `api.mjs` (from kit-ext-3): fold BUILT/MEMBERS/OPTIONAL and the per-member defaults into one MEMBER_DEFAULTS table derived from `errors.RESERVED`.
- `kit.json` (from KIT-M6): the `queries` row lists a `resolve` dep that it does not need (queries.mjs imports only api and errors). Drop it.
- `settings.mjs:16` (from KIT-M11): the SettingRow typedef leaves out `filePicker`, which defineSettings forwards at :59. Also check the defineKeybindings JSDoc wording about hard-coded labels.
- `publish.mjs:25` (from KIT-M10): the publishedOf doc comment says it returns `{ when, at }`, but it returns `{ when, at, module, alias }`.
- `publish.mjs:87` (KIT-R2): `inspect(ref, null)` throws an uncoded TypeError. Fix: `const o = opts && typeof opts === 'object' ? opts : {}`. This is a failure-path change.
- `election.mjs:61` (KIT-R3): claimDocument/claimMessage reject with an uncoded error when the update fails, and return true for a null or id-less doc. Decide for each caller (aoe/effects.mjs:184, aoe/resolve.mjs:443, attunement/bonds.mjs:85), or update the docstring.
- `settings.mjs:185` (KIT-R4): a partial multi-key serialStore mutate writes undefined to every omitted key. Choose `next[k] ?? current[k]` or a BAD_ARGS throw, and document that mutate must return every key.
- `settings.mjs:185` (AC-6): a multi-key serialStore write is several separate Setting writes, so onChange sees intermediate states and a failure leaves a torn pair. Document the window in the JSDoc and README.
- `resolve.mjs:102` (KIT-R5): an unloaded compendium UUID gives a misleading "BAD_ARGS: expected Actor, got undefined". Treat it as NOT_FOUND, or refuse Compendium refs.
- `argon-kit.mjs:67` (KIT-R6): applyButtons does not await `b.render()` and has no catch, so a rejection is unattributed. Fix it when combat and transform are re-characterised.
- `queries.mjs:97` (KIT-R7): a remote queryGM rejection is uncoded and is reported as INTERNAL, and `TIMEOUT` is never produced. Map it to TIMEOUT.
- `queries.mjs:92` (AC-4): the queryGM timeout bounds only the remote path. Add a local race, or qualify blueprint §5.9.1 and the README.
- `queries.mjs:69` (AC-5): a GM tab that has not yet published answers NOT_READY at once and can beat a ready tab's answer. Add it to §5.9.5, and decide whether to wait or stay silent.
- `log.mjs:83` (kit-edge-8): `log.notify` returns before its console line when ui.notifications is missing, so errors notified during init vanish. The stub also installs ui.notifications earlier than Foundry 14 does.
- `README.md:32` and the resolve.mjs header and publish.mjs:83 comment (KIT-M2): reword "exact match only" to "exact name, then a unique case-insensitive exact name; never a substring".
- `README.md:43` (KIT-M3): replace the argon-tooltip.css status clause. Combat, transform and riders list it in their module.json styles.
- `README.md:44` (KIT-M9): add foundry-stub `stubId` and harness `sourceFiles` to the export lists, then land an export-list guard test.
- `api.mjs:60` (KIT-M4): add `g = globalThis` to the buildApi options and thread it into bind and resolveRef, then drop the globalThis.game swaps from the tests.
- `test-kit/foundry-stub.mjs:343` (KIT-M5): split installFoundry into makeHooks, makeSettings, makeI18n and makeUsers, keeping the goldens byte-identical.
- `errors.mjs:65` (KIT-M7): isCoded and withRef have no outside consumers, and installRoot is used only by publishNamespace. Keep them and say so in the README, or drop them at the next minor bump.
- `api.mjs:197` (kit-ext-5): drive describe()'s optional fields from one field table, iterated in the current order.
- `resolve.mjs:14` (kit-ext-6): merge the three ref-kind tables (a refactor), and decide whether buildApi should reject unknown ref kinds (a behaviour change).
- `test-kit/foundry-stub.mjs:529` (kit-ext-7): drive the stub's collections and fromUuidSync from one table mirroring resolve.mjs COLLECTION. Macros, tables, combats, folders, playlists and owned-item uuids are missing today.
- `settings.mjs:59` (kit-ext-9): defineSettings drops keys outside its allowlist, and defineKeybindings has no labels option. Document the allowlist or export it as SETTING_PASSTHROUGH.
- `perf.mjs:16` (kit-perf-2): memo evicts FIFO and holds placeable keys strongly. When it is first adopted, document a string keyFn (uuid), or switch to LRU/WeakMap.
- `perf.mjs:37` (kit-perf-3): reword blueprint §5.5 to say coalesce suits idempotent reads, and rebuilds need debounce or a trailing variant.
- `settings.mjs:81` (kit-perf-4): add a README/§5.5 note to cache hot client-scope reads at the call site and invalidate them from onChange.

## Verification

- 65441ba0: keep
- 2c8361b6: keep
- daf43fe8: keep
- 8763e2f2: keep
- d4a39484: keep
- e49499a7: keep
- 77f998f5: keep

## Gates

- `make foundry-lib-check`: ok, exit 0. 100 tests, 100 pass, 0 fail. No lib source changed, so vendor and modules-check were skipped. The diff is test files only, and untouchables are clean.
- `make check-context` passed with this record in place.
- Goldens byte-identical: yes (`git diff --quiet origin/main -- '**/golden/**'` exits 0).
