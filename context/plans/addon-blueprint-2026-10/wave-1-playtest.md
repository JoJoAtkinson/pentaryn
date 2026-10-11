# Wave 1 play-test record

**Read this when:** you are deciding whether `migrate/wave-1` is safe to merge, or want to know what the three live play tests found. History, not instructions.

Date 2026-10-11. Foundry v14.369, dnd5e 6.0.6, Argon HUD, world `pentaryn`. Scratch scene "ZZ Arena", actor folder "ZZ usability", player `ZZ Tester` on `zz<n>.localhost`. All of it is deleted (see Cleanup).

## Verdict

No wave-1 regression in any of the three tests. Every issue below traces to code unchanged since `wave-1-base` (`git diff wave-1-base..HEAD` shows no change under pentaryn-combat, -riders, -transform, -aoe, dropbin `corpses.mjs`, or the pings socket listener). Nothing blocks the merge. Three majors are preexisting and worth their own tickets (PT3-1, PT3-2, PT3-3).

One factual correction to the run brief: **D7 is not vendored into any module.** Commit `d959b66` only adds the canonical `foundry/lib/argon-tooltip.css`; no module copies it or lists it in `module.json`. Combat tooltips are still styled by `pentaryn-transform`'s `transform.css` (11 `pentaryn-tt` rules; combat and riders have 0), so they look right today but depend on transform being active (PT1-5).

## The three tests

| Test | Verdict | Covered |
|---|---|---|
| PT1 Melee combat round with riders | looks good | Full Attack picker and sequences (Paladin, Fighter with Nick), Esc pause and Resume, Divine Smite, Lay on Hands, off-hand Dual Wielder, End Turn flow, Argon tooltips, player-tab console clean |
| PT2 Area spells, saves, refund (built from a prompt marker) | minor issues | Prompt-marker character build, D6 gather cut suffix, Fireball aim/cancel/refund/save tray/Apply, Burning Hands cone, Magic Missile, no NPC save leak to the player |
| PT3 Wild Shape / Starry Form, attributes study, wave-1 table tools | minor issues | Wild Shape and Starry Form, temp HP, ties D1 (`examine`/`inspect`, `lookup`/`describe` aliases, one warning each), names rename cascade, pings, cursors, importer, `describe()` for importer/names/pings/cursors, keystone namespace audit |

A recheck round dropped PT1-1, PT2-1, PT2-4 (hidden-tab Dice So Nice artifact and native dnd5e Apply on another scene; wave 1 touches neither).

## Issues (all PREEXISTING)

| Id | Sev | Summary | Fix |
|---|---|---|---|
| PT3-1 | major | A corpse revived by dropbin keeps `delta.ownership {default: OBSERVER}`; players can open the enemy's full NPC sheet. `corpses.mjs fromCorpse()` writes `{}`, which a recursive update merges away. | Not fixed. Replace the map non-recursively. |
| PT3-2 | major | Pings never records a player ping on a scene the GM is not viewing. Listener reads `data.ping.x/y/sceneId`; core sends `{cursor:{x,y}, ping:{scene}}`. | Not fixed. `record(userId, data.ping.scene, data.cursor.x, data.cursor.y)`. |
| PT3-3 | major | A druid without a hand-made revert item gets no "Return to <name>" HUD button in beast form. | Not fixed. Synthesize one in `composeBonusBar`. |
| PT1-2 | minor | Player Lay on Hands spends the pool but does not heal the target (known P-3-h). | Not fixed. |
| PT1-3 | minor | Divine Smite is ~8 clicks for a one-swing smite (budget 5). Known. | Not fixed. |
| PT1-4 | minor | Argon HUD does not self-enable for a late-joining player tab (1 click). Vendor. | Not fixed. |
| PT1-5 | minor | D7 not vendored; combat tooltip rules come from transform.css. | Not fixed; wire D7 in wave 2. |
| PT2-2 | minor | Prompt-markers character helper leaves spell slots at 0. | Not fixed. |
| PT2-3 | minor | Fireball 6-7 clicks (budget 2); icon-only Damage button. Known. | Not fixed. |
| PT3-4 | minor | Starry Form stays as a raw Argon button in beast form. | Not fixed. |
| PT3-5 | minor | Wild Shape picker at druid 5 offers only CR 1/4 (vendor data); "1 known forms" plural typo. | Not fixed. |
| PT3-6 | minor | Esc with the Change Form picker open opens the game menu. | Not fixed. |
| PT1-6, PT1-7, PT1-8, PT1-9, PT2-5, PT3-7, PT3-8, PT3-9 | cosmetic | Nick banner overflow; duplicate "radiant" tag; hit/miss inferable from missing damage card; smite drawer position; duplicate gather description per unlinked token; no chat line on sheet Restore Transformation; creatures strip shows through tooltips; names does not rename combatants (scope gap). | Not fixed. |

No fixes were made in this verification: no code changed, so no fix commits.

## Click counts (against the usability plan budgets)

Paladin Full Attack no target 4 (A2: 4, met). Fighter Full Attack with Nick 5 (A5: 4; +2 for Esc pause and Resume). Off-hand Dual Wielder 2 (A7: 2, met). Divine Smite after hit 5 (F1: 5 total, over). Lay on Hands 6 (F2: 3, over, and the heal did not apply). End Turn 1. Late-join HUD toggle 1 (T4: 1, met). Fireball 7 first cast, 6 after (budget 2, known); cancel 3; Burning Hands 6; Magic Missile 6. Wild Shape 4 (D1: 2); Starry Form Archer and shoot 5 (D5: 5, met); Wolf Bite 3; study "Take a closer look" 2 (K: 2, met).

## Final verification (this run)

| Check | Result |
|---|---|
| `make foundry-modules-check` (node tests of every module) | pass: all 19 modules pass their gates |
| `make foundry-lib-check` | pass: fail 0 |
| `make check-context` | pass (3 warnings: missing "Read this when" on three plan files) |
| `./.venv/bin/pytest -q` | pass: 866 passed, 2 skipped, 4 xfailed |
| Live boot probe | pass: every `pentaryn-*` module active at its manifest version except `pentaryn-walls`, which is inactive in the world config (unchanged by this branch, content-only `seafoot-maps` is active); `game.pentaryn` has a namespace for every active scripted module; `describe()` answers for importer 1.1.0, names 0.1.0, pings 0.1.0, cursors 0.2.0, ties; `prompts` has no `describe()` (not yet migrated, wave 2) but exposes `status`/`version` |
| Foundry server log since run start | not read directly (no server log path in the repo); the eval and MCP logs show only expected transport failures during the planned pings restart |
| One GM tab, no player tabs | pass: only Gamemaster is active |
| Drow Prison active and paused, 0 combats | pass |
| No ZZ documents (actors, scenes, folders, journals) | pass: 0 of each |

## Cleanup diff

Deleted: scene ZZ Arena and its 8 tokens; actors ZZ Paladin 5, ZZ Fighter 5, ZZ Goblin, ZZ Sorcerer 5, ZZ Druid 5; folder ZZ usability; user ZZ Tester; journals for ZZ Tester and ZZ Fighter 5; 44 chat messages created after the snapshot (chat back to 34). Real PCs (Caven 75, Marrith 69, Talo 99 HP; slots, uses, flags, ownership) match the pre-run snapshot. Settings spot-checked unchanged (`dnd5e.attackRollVisibility` none, `core.diceConfiguration` `{}`, every `pentaryn-combat` setting true). `foundry/logs/**` stays uncommitted.

## Harness notes for later play tests

Chrome MCP player tabs run hidden, which freezes Dice So Nice and hides roll cards: hide `#dice-box-canvas` and patch `game.dice3d.showForRoll` on the player tab first. `combat.endCombat()` over eval-js hangs on a confirm dialog on the bridge tab; use `combat.delete()`. `make login` waits only 90 s; run it in the background and open the URL at once.
