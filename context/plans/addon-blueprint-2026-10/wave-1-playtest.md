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

## Fixes on fix/playtest-2026-10-11 (2026-10-11)

Branch `fix/playtest-2026-10-11` (worktree `pentaryn-fixes-wt`), not pushed, not merged. Nothing was run live. Every fix has a test that failed before it. The status column in the findings table above is the play-test snapshot and is not rewritten. The findings fixed here are PT3-1, PT3-2, PT3-3, PT3-4, PT3-6, PT3-7, PT3-9, PT2-2, PT2-5 and PT1-6.

Gates at the branch head: `make foundry-modules-check` passes all 19 modules, `make foundry-lib-check` 0 failures, `make check-context` passes (3 existing warnings), `pytest -q` 866 passed / 2 skipped / 4 xfailed. Conformance: names 100 %, pings 100 %, dropbin 60.9 %, prompts 56.5 %, combat 50.0 %; transform is not migrated. Dropbin, prompts and combat are unchanged or better than baseline.

| Finding | Module and version | Fix commits | Tests added |
|---|---|---|---|
| PT3-1 | dropbin 0.2.2 | `ed025704`, `938c43ed` (re-pile review), guide `8a8a2d5e`, `a6bd2f97` | `test/corpses.test.mjs`, 4 tests |
| PT3-2 | pings 0.1.1 | tests `466a3a4f`, [declared] `a18872c9`, fix `7a8701df`, changelog `047890a4` | 3 tests; 6 socket tests re-shaped to core's payload |
| PT3-3 | transform 0.3.3 | `f05a289b` (test infra), `a9084088`, `f3cca84d` (no Return in a Polymorph form) | core checks 150-152, 157, plus playtest tests |
| PT3-4 | transform 0.3.3 | `89d8fbb4` | core checks 153-156, plus 1 playtest test |
| PT3-6 | transform 0.3.3 | `bc4e1f4b` | 1 playtest test |
| PT3-7 | transform 0.3.3 | `42365fed` | 3 playtest tests |
| PT3-9 | names 0.1.1 | `5277d616`, `f57cd997`, `6ce6ad65`, guide `82a0524a` | `test/combatants.test.mjs`, 5 tests |
| PT2-2 | prompts 0.4.4 | `7eb14f09`, `3043e077` (bump) | `test/pt2-2-slots.test.mjs`, 4 tests |
| PT2-5 | prompts 0.4.4 | `447697de`, docs `eafeb4bc` | `test/pt2-5-gather.test.mjs`, 3 tests |
| PT1-6 | combat 0.2.5 | `d7a7c7b6`, `99102603` (fixture 383), docs `7e675f30`, `db9e94fe` | fixtures 378-383 |

### LIVE CHECK steps

Reload GM and player tabs after each sync. Keep one GM tab open for the pings and names checks.

**PT3-1 dropbin**
1. `game.modules.get("pentaryn-dropbin").version === "0.2.2"`.
2. Take an unlinked hostile NPC token `t`. Check `t.delta.ownership == null`. Kill it. Expect `{default: 2}` and the flags `corpse: true, ownership: null`.
3. Revive with the HUD button, and separately by healing. Then `t.delta.ownership == null`, no `corpse`, `sight` or `ownership` flag, the player has no OBSERVER access, and the player's double-click opens no sheet.
4. Set `{default: 0, [playerId]: 2}` first, kill, revive: the map comes back unchanged.
5. Re-pile case: revert the pile with Item Piles, deal 1 more damage, revive. Ownership is still null.

**PT3-2 pings**
1. GM on scene A, player on scene B. The player long-presses. `game.pentaryn.pings.recent(1)` shows B's sceneId and the right x/y, and about 250 ms later the setting log's last entry matches.
2. Both on A: the ping animates and exactly one record is added.
3. Shift-ping on B: recorded, and the GM view does not pan.
4. The GM's own ping is recorded once.
5. On different v14 levels it is recorded once. No "socket ping capture failed" warning.

**PT3-3, PT3-4, PT3-6, PT3-7 transform**
1. A druid with no revert item in Wild Shape has a highlighted "Return to <name>" in the Bonus bar. It reverts, posts one line, and the bonus action is greyed in combat. Talo's own item shows exactly one Return. A Polymorph spell form shows none.
2. Circle of the Stars in beast form: no Starry Form on the Bonus or Special bar or the sheet, the console says `spends-wildshape` or `starry-form`, and there is no "could not be found" warning. It still works in normal form.
3. Esc closes the Change Form picker and the Starry picker without opening the game menu. With nothing open Esc opens the menu. Esc cancels target choice. One click reopens a picker.
4. Sheet Restore Transformation and the sidebar revert each post one "returns to normal form" line. The HUD Return posts one line, Change Form only the shift line, and a Polymorph revert nothing.

**PT3-9 names** (version `describe().version === "0.1.1"`)
1. Two unlinked "Goblin" combatants, one custom-named "Boss". Rename the base actor to "Goblin Scout": the plain one follows, "Boss" stays, the toast counts tokens only.
2. A "Name, Title" actor with a short-form combatant renamed to "New, Other" shows "New".
3. A second combat holding that actor also updates.
4. With the bridge tab and a browser GM tab both open, both trackers update with no console error.
5. A player's rename of their own PC: token labels follow, the combatant keeps the old name, no error.

**PT2-2, PT2-5 prompts** (`game.pentaryn.prompts.status().version === "0.4.4"`)
1. A dry run of Sorcerer 5 ends its `sheet:` line with `slots 1st 4/4, 2nd 3/3, 3rd 2/2`. A real run gives `system.spells.spell1.value === 4` and the Spells tab shows 4/4.
2. A Warlock 5 shows `slots pact 2/2 (3rd)`.
3. Three unlinked tokens of a world NPC with a custom biography: gather prints the description once and `Description: same as t<n> "<name>"` for the others. Changing one token's own biography makes it print its own. Delete the ZZ scratch documents afterwards.

**PT1-6 combat** (version 0.2.5)
1. A Fighter with Nick, in combat: hover Full Attack. The subtitle wraps to two centred lines, nothing is cut, and it clears the title and body.
2. Without Nick it is one line as before. Other combat tooltips and transform's tooltips are unchanged.

### Deploy

Run after Joe's play session, in this order, then reload clients.
- Merge `fix/playtest-2026-10-11` into main first. The worktree and the live Data folder are separate, so sync from the merged main.
- `make foundry-dropbin-sync`, `foundry-pings-sync`, `foundry-names-sync`, `foundry-prompts-sync`, `foundry-transform-sync`, `foundry-combat-sync`.
- `module.json` changed for all six, but only the `version` field (confirmed by diff). A Foundry restart is needed for the new versions to show in the manifest. Names and pings had their last restart noted in wave 1. Restarting once after all six syncs is simplest.
- Dropbin read-only scan for leaked ownership. Run it with eval-js and write nothing until the list has been read. Writing `null` also drops a per-token map a GM set on purpose. Add `t.disposition!==H||` removal to also catch revived NPCs whose disposition changed.

```js
const L=CONST.DOCUMENT_OWNERSHIP_LEVELS,H=CONST.TOKEN_DISPOSITIONS.HOSTILE,out=[];for(const s of game.scenes)for(const t of s.tokens){const a=t.actor,f=t.flags?.["pentaryn-dropbin"]??{},o=t.delta?.ownership;if(a?.type!=="npc"||t.disposition!==H||f.corpse||game.itempiles?.API?.isValidItemPile?.(t))continue;if((o?.default??0)>=L.LIMITED)out.push({scene:s.name,sceneId:s.id,token:t.name,tokenId:t.id,linked:t.actorLink,ownership:o,dropbinFlags:f});}out;
```

Leaked tokens show `dropbinFlags: {}` and `ownership: {default: 2}`. To clean the reviewed list, run `for(const [sid,rows] of Object.entries(Object.groupBy(out,r=>r.sceneId))) await game.scenes.get(sid).updateEmbeddedDocuments("Token",rows.map(r=>({_id:r.tokenId,"delta.ownership":null})));`, rescan (expect `[]`) and reload once.

### Remaining notes
- Not fixed, by scope: PT1-2, PT1-3, PT1-4, PT1-5, PT2-3, PT3-5, PT1-7, PT1-8, PT1-9, PT3-8.
- Known follow-ups from review: sheet and sidebar reverts skip the module's carry-back of item uses and conditions. Change Form also shows in a Polymorph form. Re-piled corpses keep `sight` false. Writing `null` to an unlinked player-owned NPC token's ownership drops access until reload. Every GM tab records pings and renames on its own (the J8 pattern).
