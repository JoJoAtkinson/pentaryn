---
title: Addon blueprint wave 5 report (the Wave 7 restart batch, kit 1.1.0, strict gates)
status: code phase closed
last_modified: 2026-10-12
tags: [foundry, modules, blueprint, migration, wave5, wave7]
---

# Wave 5 report

**Read this when:** you need what wave 5 (lane W5c) changed, which gates it left strict, what is
excepted and why, and what Joe's 2026-10-12 decisions became. **Not this file:** the item list and
baseline → [`wave-5-baseline.md`](wave-5-baseline.md) · the batch rows and their applied record →
[`wave7-restart-batch.md`](wave7-restart-batch.md) · how to take it live →
[`wave-5-live-plan.md`](wave-5-live-plan.md).

## Summary (code phase closed, 2026-10-12)

Wave 5 is the **Wave 7 restart batch** plus **Stage 5 step 2**. Every `module.json` row the
migration guides deferred is applied, one commit per module. Kit 1.1.0 adds the `dryRun` row field
(W2-B3) and the `resolve: "self"` param marker (W2-B4), and it is re-vendored into all 20 modules.
The vendor and conformance gates are now **strict** for every module, with nine documented
exceptions. `context/foundry/argon.md` (W4-I1) is written.

This was the **code phase only.** Nothing was synced, restarted, pushed to main or run live. The
walls flag-scope **data migration did not run and is not wired**: walls stays off in the world.

- **Branch.** pentaryn `migrate/wave-5` = `wave-5-base` (`7b444c6f`, `origin/main` after W4L) plus
  the commits listed under "Commits", pushed to `origin` with the tag `wave-5-base`.
- **Fork.** No change. `pentaryn` `7712417` already passes `names.sync`'s first `ref` with
  `resolve: "self"` (its `needsDoc` refuses only `resolve === false`) and honours `row.dryRun`
  (`takesDryRun`). The one-line case for a **non-first** param carrying the marker is a recorded
  follow-up.
- **Deploy.** 19 modules, one Foundry restart (every manifest changed). Not walls. The live lane is
  W5L ([`wave-5-live-plan.md`](wave-5-live-plan.md)).
- **Left undone on purpose.** The walls data migration (parked, walls off); attunement's `_loc`
  switch (guide step 8, its call sites are in `bonds.mjs`, the fx2 lane's code); the fork
  follow-ups (K2 non-first param, W3-PR4, W4-L3 is already live).

## Kit 1.1.0 (`a9ce0b18`)

| # | Edit | Source |
|---|---|---|
| K1 | Row field `dryRun: true` in the `ApiRow` typedef, emitted by `describe()`. Importer's `import` row sets it | W2-B3 |
| K2 | Param marker `resolve: "self"`: the kit passes the ref through unresolved, `describe()` keeps the marker, C62 accepts it. `names.sync`'s `ref` uses it | W2-B4 |
| K3 | Kit README, blueprint §5.1a and its rules-table row, `kit.json`, `KIT_VERSION`, every vendored header | K1, K2 |

Re-vendored one commit per module (`8d8970d8` … `f7086bd5`); every suite stayed green.

## Per module

| Module | Commit | Edits | Version | Node tests | Conformance |
|---|---|---|---|---|---|
| names | `5835ac59` [declared] | `sync`'s `ref` marked `resolve: "self"`; new pin in `sync-ref.test` | 0.1.1 | 51/51 | 100 |
| importer | `d3d9cb29` | `flags.pentaryn` merged into the existing object (gate keys kept), minimum 14, `import` row `dryRun: true`, describe golden +1 line, flags pin | 1.1.1 | 94/94 | 100 |
| lookup | `dbd8c58a` | flags (`rules`, `plk-`), minimum 14, `afterSync` | 0.3.0 | 135/135 | 100 |
| movement | `28e73b21` | flags (`pm-`), `styles/movement.css`, verified 14.369, `afterSync` | 0.1.2 | 167/167 | 100 |
| walls | `320879a2` [declared] | `languages` + `lang/en.json` (from the fixture), setting/keybinding labels as lang keys (W2-WALLS-1), toasts through `log.notify` (W2-WALLS-3), description fix, minimum 14, flags. **`flagScope` stays `wall-autocomplete`** | 0.2.0 | 204/204 | 98 (C07, excepted) |
| attunement | `a7e1395b` | flags, item-piles recommend, minimum 14, `styles/`, `languages` + **inert** `lang/en.json`, `stash`/`releaseAway` docs say eval-js only (C62 clears), describe golden | 0.2.1 | 120/120 | 97.9 (C35, excepted) |
| journal | `08ac3c3d` [declared] | flags, `systems` dnd5e, recommends, `styles/journal.css` + README row, `folderName` labels as lang keys (W2-J1); W2-J2 not taken | 0.1.0 | 94/94 | 98 (C56, excepted) |
| dropbin | `61b65058` | flags, recommends item-piles + itempilesdnd5e, minimum 14 | 0.2.3 | 120/120 | 100 (C50 was a scorer gap, `5c54ae0f`) |
| prompts | `4b9d5e49` | flags, `afterSync` (with `selftest()`) | 0.4.5 | 219/219 | 100 |
| ties | `11149c59` | flags (`pentaryn-ties`), minimum 14, verified, recommends item-piles + dice-so-nice | 0.19.4 | 251/251 | 96.1 (C05, C37, excepted) |
| creatures | `ba10619e` | flags, recommends item-piles + enhancedcombathud, `styles/creatures.css`, verified | 0.1.1 | 105/105 | 100 |
| portals | `2ce4a806` [declared] | **0.5.0** with `VERSION` and the "0.4.4" pin, flags, `styles/portals.css`, recommends, `languages` + `lang/en.json` (59 keys), every on-screen string through `_loc` full keys, settings labels, `i18n.test` replaced by lang-key pins | 0.4.4 → 0.5.0 | 193/193 | 100 |
| senses | `0c7036e8` | manifest only: flags, minimum 14, enhancedcombathud recommend | 0.4.1 | 153/153 | 100 |
| riders | `33e22823` [declared] | **0.3.0** with `VERSION`, flags, Argon ×2 recommends, `styles/riders.css` (adjustments row path follows), `lib/argon-tooltip.css` vendored and in `styles`, `#tooltip` click-through rule kept | 0.2.0 → 0.3.0 | 175/175 | 96 (C37, C56, excepted) |
| aoe | `36573303` [declared] | **0.4.0** with `VERSION`, flags, recommends, `styles/aoe.css` | 0.3.1 → 0.4.0 | 411/411 | 100 |
| transform | `fb707298` [declared] | **0.4.0** with `VERSION`, "manifest today" pin, flags, minimum 14, `lib/argon-tooltip.css` via `styles`, `@import` dropped, css.test pin | 0.3.3 → 0.4.0 | 248/248 | 100 |
| combat | `249b5cd1` [declared] | **0.3.0** with `VERSION`, "0.2.5" pin, flags, verified, description sentence, kit CSS via `styles`, `@import` dropped, css.test pin | 0.2.5 → 0.3.0 | 244/244 | 96 (C21, C23, excepted) |
| cursors | `83af47a1` | guide steps 7–8: `tools/build.mjs` → `scripts/foundry/cursors/build.mjs` (`--check-sources`), `assets/src/` → `scripts/foundry/cursors/src/`, `DESIGN.md` → `context/plans/cursors-design.md` (built PNGs unchanged; `@resvg` not installed, so no full rebuild) | 0.2.0 | green | 91.5 → 100 |
| pings, feedback | re-vendor only | kit 1.1.0 | 0.1.1, 0.1.2 | green | 100 |

**Choices that differ from the plan (W5c's own calls):**
- **Portals version:** bumped to 0.5.0 under "a version bump moves `VERSION`". Not asked by a report.
- **Transform `afterSync`:** the wave-4 report's two-line text (describe/selftest/inspect) rather
  than the five-line `config.py` tuple.
- **Shared tooltip CSS loader:** transform's and combat's `test/css-rules.mjs` read the files
  listed in `module.json` `styles`, in order.

## Other commits

| Commit | What |
|---|---|
| `97947da3` | wave 5 baseline and batch item list |
| `ab4e7be7` | C06w no longer warns about a vendored `lib/*.css` listed in `styles` (scorer gap, test added) |
| `8037e674` | the names, cursors and pings `after_sync` tuples dropped: `config.py` holds none; every module reads `afterSync` from `module.json` |
| `b231ebd1`, `7d1eac9d` | `context/foundry/argon.md` (W4-I1), its routing row and module index; then every Argon `adjustments.yml` row cited, including combat's private-state writes (`_itemButtons`, `_hudState`, the weapon-set unhook) |
| `643d8686` | Decided columns in the wave 2/3/4 reports; the "Applied on migrate/wave-5" section of `wave7-restart-batch.md` |
| `300a051f` | the walls doc-path strict xfail passes now, so it is a normal test |
| `5c54ae0f` | C50 sees a sync publisher called from another file's ready body (dropbin) |
| `3eaef7c5` | **Stage 5 step 2:** `modules.py` loses `CONFORMANCE_FAILS`, the WAIT bypass and the lock-less skip; conformance fails any failing fail-class rule without an `exceptions.json` row; a stale row fails; `conformance.py` exits 1 exactly when the gate would; `vendor.py check --all` fails a lock-less module |
| `c8a8769f` | Stage 5 step 2 recorded (README §7/W3 and Stage 5, batch exceptions, cursors and dropbin results) |
| `4ccdc350` | each exception row carries `match` patterns: a later finding of the same rule blocks the gate |
| `e1f10d39` | the i18n gate checks any `PENTARYN_*` literal, so a key under a mistyped root is caught |
| `68b90987` | `wave7-restart-batch.md` records the review fixes |

The full list: `git log --reverse wave-5-base..migrate/wave-5`.

## Gates (final, at `68b90987`)

| Gate | Result |
|---|---|
| each module's `node test/run.mjs` | all 20 exit 0 |
| `pytest -q` | 1538 passed, 2 skipped, 5 xfailed (baseline 1523 / 2 / 6; the walls xfail retired) |
| `make foundry-modules-check` (strict) | exit 0, "all 20 modules pass their gates" |
| `make foundry-lib-check` | 93 pass, 0 fail |
| `make check-context` | OK, 5 old warnings |
| `make foundry-adjustments-check` | exit 0 |
| `vendor.py check --all` | exit 0, all 20 identical to `foundry/lib` (kit 1.1.0) |
| `conformance.py` (all modules) | exit 0 |
| review checker (i18n keys, `module.json` shape, `VERSION` = manifest, ids, paths) | clean |

## Exceptions (`scripts/foundry/blueprint/exceptions.json`)

The vendor gate has none. Each conformance row has a reason, the decision that accepted it, what
retires it and `match` patterns for the findings it covers.

| Module | Rule | Reason | Decision | Retired when |
|---|---|---|---|---|
| attunement | C35 | `lang` inert; the `_loc` switch (guide step 8) touches `bonds.mjs` (fx2 lane) | wave7 batch attunement row | step 8 lands — **that commit deletes this row** or the gate fails "stale exception C35" |
| combat | C21 | `turn-riders.mjs` reads aoe's `autoDamageOnHit` with `game.settings.get` before aoe's `settings()` exists | W4-C3 | aoe offers a pre-ready read or an event |
| combat | C23 | the same cross-module setting read | W4-C3 | as C21 |
| journal | C56 | hand-written `CONFIG.queries` relay; the kit does not pass the sender | W2-J2 | the kit forwards the sender |
| riders | C37 | the Argon click-through `#tooltip` rule stays in `riders.css` | W4-R9 | Argon no longer needs it, or a riders-owned root |
| riders | C56 | hand-written Battle Medic relay | W4-R4 | as journal C56 |
| ties | C05 | `ties-api.mjs` compatibility file for world macros | W3-T6 | the next ties version |
| ties | C37 | the card layer's bare `#pentaryn-ties-cards` | W3-T1 | revisited with D7 |
| walls | C07 | `flagScope` stays `wall-autocomplete`; the data migration is parked | wave7 walls row, overnight §10 | walls on and the migration run |

## Decided (Joe 2026-10-12: "They all look minor" — take the recommendations)

Every Open-for-Joe default in the wave 2/3/4 reports was approved, and each report's Decided column
now reads `Joe 2026-10-12: <decision> — <sha or 'no change'>` (`643d8686`). The rows this lane
built or closed:

| # | Decision | Decided |
|---|---|---|
| W2-B3 | kit row field `dryRun: true`; importer's `import` row sets it | Joe 2026-10-12: build — `a9ce0b18`, `d3d9cb29` |
| W2-B4 | kit param marker `resolve: "self"`; `names.sync`'s `ref` uses it; fork checked | Joe 2026-10-12: build — `a9ce0b18`, `5835ac59`; fork needs no change for names (non-first-param case a follow-up) |
| C62 attunement | `stash`/`releaseAway` params marked eval-js only | Joe 2026-10-12: build — `a7e1395b` |
| W2-WALLS-1 | walls setting/keybinding labels as lang keys | Joe 2026-10-12: build — `320879a2` |
| W2-WALLS-3 | walls toasts through `log.notify` | Joe 2026-10-12: build — `320879a2` |
| W2-J1 | journal `folderName` labels as lang keys | Joe 2026-10-12: build — `08ac3c3d` |
| W2-J2 | journal `ensureOwn` through the kit only if the kit forwards the sender | Joe 2026-10-12: keep the hand-wired relay (kit 1.1.0 does not forward the sender) — no change |
| W4-R6, W4-T3 (+ aoe, combat) | version bumps with `VERSION` | Joe 2026-10-12: in the batch — riders `33e22823`, transform `fb707298`, aoe `36573303`, combat `249b5cd1` |
| W4-C6, W4-T4 | `lib/argon-tooltip.css` through `styles`, `@import` dropped in the same commit | Joe 2026-10-12: build — combat `249b5cd1`, transform `fb707298` |
| W4-R5, W4-R9 | riders D7 vendor; keep the click-through rule in `riders.css` | Joe 2026-10-12: build — `33e22823` (C37 excepted) |
| W4-I1 | write `context/foundry/argon.md` | Joe 2026-10-12: build — `b231ebd1`, `7d1eac9d` |
| W2-MOV-1 | — | Joe 2026-10-12: closed — no change |
| W2-B1 | pointer to P7 | Joe 2026-10-12: closed — no change |
| W3-SE1, W3-T5, W4-C4 | — | Joe 2026-10-12: deferred — no change |
| W4-L4 | the restart batch is its own session | Joe 2026-10-12: wave 5 — this branch; live in W5L |
| walls data migration | must not run while walls is off | Joe 2026-10-12: parked — no change (C07 excepted) |

## Follow-ups (recorded, not built)

- **Fork K2:** `pentaryn-call.ts` `needsDoc`: `if (p?.resolve === 'self') return false;` for a
  non-first param, plus its vitest; its doc comment naming `names.sync` as refused is stale.
- **Fork lane:** W3-PR4 (the fork halves of mcp-fork-15 and prompts-lookup-11/-12).
- **Attunement step 8** (`_loc`, declared) after the fx2 lane's bond-code work merges — a reload,
  not a restart (`languages` is in); delete the C35 exception row in the same commit.
- **Walls flag-scope migration:** the walls row's "Code in the same batch" column, when Joe turns walls on.
- **Cursors:** a full PNG rebuild once `@resvg` is installed (`scripts/foundry/cursors/build.mjs`).
- **Merge with fx2:** attunement `README.md`/`CHANGELOG.md` edited on both sides; `attunement.css`
  moved to `styles/` here (git rename detection carries an fx2 edit; check it).

## Deploy list (W5L)

One sync each from `main` after the merge, one Foundry restart, `FROM=local`:

| Module | Target | Version |
|---|---|---|
| pentaryn-aoe | `make foundry-aoe-sync` | 0.4.0 |
| pentaryn-attunement | `make foundry-attunement-sync` | 0.2.1 |
| pentaryn-combat | `make foundry-combat-sync` | 0.3.0 |
| pentaryn-creatures | `make foundry-creatures-sync` | 0.1.1 |
| pentaryn-cursors | `make foundry-cursors-sync` | 0.2.0 |
| pentaryn-dropbin | `make foundry-dropbin-sync` | 0.2.3 |
| pentaryn-feedback | `make foundry-feedback-sync` | 0.1.2 |
| pentaryn-importer | `make foundry-importer-install` | 1.1.1 |
| pentaryn-journal | `make foundry-journal-sync` | 0.1.0 |
| pentaryn-lookup | `make foundry-lookup-sync` | 0.3.0 |
| pentaryn-movement | `make foundry-movement-sync` | 0.1.2 |
| pentaryn-names | `make foundry-names-sync` | 0.1.1 |
| pentaryn-pings | `make foundry-pings-sync` | 0.1.1 |
| pentaryn-portals | `make foundry-portals-sync` | 0.5.0 |
| pentaryn-prompts | `make foundry-prompts-sync` | 0.4.5 |
| pentaryn-riders | `make foundry-riders-sync` | 0.3.0 |
| pentaryn-senses | `make foundry-senses-sync` | 0.4.1 |
| pentaryn-ties | `make foundry-ties-sync` | 0.19.4 |
| pentaryn-transform | `make foundry-transform-sync` | 0.4.0 |

**Not deployed:** pentaryn-walls (off; its data migration parked), the fork and the bridge module (unchanged).

## Live phase

Not run. Filled in by W5L ([`wave-5-live-plan.md`](wave-5-live-plan.md) §13).
