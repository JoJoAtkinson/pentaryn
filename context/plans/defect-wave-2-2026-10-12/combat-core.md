---
title: "Defect wave 2 2026-10-12 — combat-core"
status: done
last_modified: 2026-10-12
tags: [plan, record, defect-wave, foundry]
---

**Read this when:** you want the history of defect wave 2 for combat-core (pentaryn-combat) — what was fixed, how, and how to check it live. History, not instructions.

# Defect wave 2 2026-10-12 — combat-core

Branch `fix2/combat-core-2026-10-12`, 21 commits on top of `3a740f4b`. Every fix is a declared
behaviour change approved by Joe on 2026-10-12; where Joe gave no ruling the review's
recommendation was taken. Gate `make foundry-combat-check` green (278 tests, 328 core fixtures,
conformance 49/50 with C23 the only accepted exception — C21 retired by M6).

Shipped files changed: `foundry/module/pentaryn-combat/*.mjs` (no `module.json`, lang or styles
change) plus `scripts/foundry/blueprint/exceptions.json` (conformance tooling only).

## Fixes

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| ROB-2 | `api.abort(x)` ignored most ways of naming a creature | recommendation | Stopping an attack run works when the creature is named by token, name, id or UUID; no name stops any run; an unknown name stops nothing. | c2acddb3 | api.test, sequence.test |
| ROB-3 | rider / Undo / swing-Damage button failures surfaced as anonymous unhandled rejections | recommendation | A failing button logs one `pentaryn-combat \| ...` warning; success path unchanged. | afff3bca | riders.test |
| ROB-4 | one throwing feature uninstall aborted the whole uninstall | recommendation | A failing feature is named in a warning; every other feature and hook is still removed. | 3c7e4f7a | uninstall-robust.test |
| ROB-5 | Reaction mark / last weapon / starting-weapon-set write failures were swallowed | recommendation | Each failed save now warns; play continues. | cbfb29fe | failure-paths.test, shapes.test |
| ROB-6 | `api.followUp` with no/invalid follow-up crashed | recommendation | Answers `{ rolled: 0, status: "unknown" }` and rolls nothing. | 46257c44 | sequence.test |
| EC-7 | floating-text guard patched the getter even when Off | prefer native | With the setting Off Foundry's own getter runs; On still returns 0 for destroyed text. | 16011eb8 | turnflow.test |
| AC-1 | seedAll wrote weapon sets actor by actor (half-done on failure) | recommendation | All missing weapon sets are written in one save; on failure nobody is half-done and the GM console names who was skipped. | f00dc7c8 | shapes.test, seed-all golden |
| M2 | turn tracker imported unused follow-up code | recommendation | No table change; dead import gone. | 084a3930 | core-split.test, graph golden |
| M10 | turn ↔ turnflow import cycle | recommendation | No table change; `actionsLeft` lives in core/turn.mjs, cycle gone. | 084a3930 | core-split.test, graph golden |
| M14 | README duplicated the Quick/rider settings paragraph and missed `quickened` | recommendation | README explains the per-player settings once and lists the Quickened marker. | 3ade9365 | docs.test |
| M8 | test-only exports in offhand.mjs | recommendation | No table change; tests repointed. | 6cac2713 | counting/hooks/shapes tests, graph golden |
| EXT-11 | attack-action kinds and movement keys listed in several places | recommendation | No table change; each list written once (`ATTACK_ACTION_KINDS`, `MOVEMENT_KEYS`). | 084a3930 | core fixtures |
| EXT-12 | Flurry strike count computed twice; no-Focus Monk case split | recommendation | A Monk with no Focus still sees a greyed Flurry (2, or 3 with Heightened Focus) while the Bonus Action is free; one rule computes it. | 723dbf33 | core fixtures, core.test |
| EXT-2 follow-up | rider-key description in the API manifest was a hand list | recommendation | API description of rider keys is built from the rider table. | 68f8d527 | i18n.test (drift) |
| M5 | magic-number timings in sequence.mjs | recommendation | No table change; timings named (values unchanged). | 243d5106 | timing.test |
| M6 | pentaryn-aoe `autoDamageOnHit` read in two places | recommendation | No table change; one reader `aoeAutoDamage()` in settings.mjs; C21 exception retired. | c45001a2 | settings.test |
| M9 | runSwings too long | recommendation | No table change; paused-choice and roll-args helpers extracted. | e50f5c2d | sequence.test |
| EXT-6 | Dual Wielder flag read in four places | recommendation | No table change; one `enhancedDualWieldingOf`. | b3366986 | shapes.test |
| EXT-4 | one-swing follow-ups in an if-ladder | recommendation | Table `SINGLE_SWING`; lookup only for a real string own key, so `["hew"]`-style kinds answer `unknown` as before. | fafaf2a4, cb1e3905 | sequence.test, i18n.test |
| EXT-7 | Multiattack name test duplicated | recommendation | No table change; one `isMultiattackItem`. | 96e21873 | shapes.test |
| EXT-9 | a mistyped rider `needs` would silently offer the rider everywhere | recommendation | Test-only: a fixture fails on an unknown `needs`. | 14f718b1 | core fixtures |
| EXT-13 | Argon package id written three times | recommendation | No table change; `core.ARGON` used everywhere. | 36543381 | api/core/shapes tests, surface golden |

No item was reverted (every committed item held under review).

## Goldens changed

- `describe.json` — ROB-2 (abort accepts token/name/id/UUID).
- `graph.json` — M2/M10 (no turn↔turnflow cycle, unused import dropped), M8 (test-only exports gone).
- `surface.json` — EXT-11 via the M2 commit (`core.ATTACK_ACTION_KINDS`, `core.MOVEMENT_KEYS`), EXT-13 (`core.ARGON`).
- `seed-all.json`, `ready-calls.json` — AC-1 (one batched `Actor.updateDocuments`).

All plan, follow-up, sequence, strip, counting and shapes goldens are byte-identical.

## Live check after deploy

Scratch docs only (ZZ prefix); delete them afterwards. Never the real PCs or campaign scenes.

- **ROB-2** — on a ZZ scratch scene start a Full Attack for `ZZ Fighter` and leave it paused on the strip. `game.pentaryn.combat.abort("no such creature")` leaves `running()` set and the strip open; `abort("ZZ Fighter")` clears `running()` and hides the strip. Repeat with the token, and with `abort()`.
- **AC-1** — create `ZZ Seed A` and `ZZ Seed B` (characters with a class item, a melee and a ranged weapon, no `flags.enhancedcombathud`). `await game.pentaryn.combat.seedAll()` returns both and both carry weapon sets 1 and 2; a second call returns `[]`. Delete both.
- **EXT-12** — a ZZ Monk with 0 Focus, in combat on their turn with the Bonus Action free: the HUD shows a greyed Flurry of Blows button.
- **ROB-6** — `await game.pentaryn.combat.followUp(<ZZ actor>)` resolves `{ rolled: 0, status: "unknown" }` with no chat card.
- **EC-7** — with the floating-text guard Off, a damage number on a ZZ token floats and fades normally with no console error.
- All other items are code only: covered by the gate above; a quick ZZ Full Attack plus off-hand follow-up behaving as before is the smoke check.
