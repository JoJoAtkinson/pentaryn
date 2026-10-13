# Defect wave 2 (2026-10-12/13) — wave record

**Read this when:** you want the history of defect wave 2 (2026-10-12/13): what Joe asked for, his
rulings, how the runs went, which groups merged, how each was checked live, what changed at the
table, and what is still open. History, not instructions. Each group has its own record in this
folder with commits, tests and live-check steps; this page summarises them.

## Joe's request and rulings

The final review ([`../final-review-2026-10-12/README.md`](../final-review-2026-10-12/README.md))
came back NEEDS-JOE on every area. Wave 1 shipped the urgent items
([`../defect-wave-2026-10-12/README.md`](../defect-wave-2026-10-12/README.md)). On 2026-10-12 Joe
approved everything that was left: "create a dynamic workflow to solve all of these things". Every
fix in this wave is a **declared** behaviour change. Where Joe gave no ruling, the review's
recommendation was taken, within his standing principles: track and mark, never hard-block
players; timers only in combat; simple rules; chat cards use token names; prefer native over our
patches.

His rulings for this wave:

- **Metamagic is tracking.** For Careful Spell the player picks which creatures it protects. The
  next save tray protects exactly those creatures, and the GM can toggle rows. Careful Spell stays
  on the character sheet.
- **Dead NPCs are loot only.** Players never open a corpse's sheet. They loot it through Item
  Piles.

The multi-party plan is parked and was not touched.

## How it ran

1. **Triage.** 767 review findings were triaged: 673 to fix, 96 dropped, and 2 questions that Joe
   answered (the two rulings above). The fixes were grouped by module or tool area. Each group got
   a `fix2/<group>-2026-10-12` branch, a fixer, a verifier, and a group record in this folder.
2. **FIX-2 deploy (2026-10-13 ~04:00Z).** Kit 1.2.0 merged first. Then the run took the world
   backup `world-2026-10-13-040903` and merged 23 groups into main. It restarted Foundry once
   (kit, `lang/` and `module.json` changes), deployed, and checked the groups live.
   - **ties-ui was parked.** Merged with ties-core it broke 2 tests: ties-core R8 made markLearned
     answer `writeFailed` instead of throwing, and EC-2's concurrent ensure clashed with ties-ui's
     serial writes.
   - **senses was reverted** (`d26ef1db`). The senses-edge-4 fix let Foundry's `LightData` clean
     the shard item's light flag in place, so the flag grew from 3 keys to 15. A doused torch then
     lost its flicker, which showed up as an undeclared live golden diff.
   - Main was pushed at `d26ef1db`.
3. **FIX-3 finish (2026-10-13).** Four branches were finished first (ties-study, live-goldens,
   senses forward fix, ties-ui reconciled with ties-core).
   - **Merges.** Ten branches were merged (`300acf1f`, pushed). Pings went red in `make test` and
     was reverted (`4b1f287c`), so it is parked. The riders vendored kit was regenerated to 1.2.0
     (`300acf1f`).
   - **Deploy.** Seven modules were synced with a GM-tab reload and no restart. Every live golden
     matched the FIX-2 baseline. Lookup's 8 differences are all declared.
   - **Live checks.** Every group was then checked live on the one GM tab with ZZ scratch docs.
     Five checks failed: dropbin DB-AC-1, importer AC-2, names AC-3, prompts-adapters EC-6, and
     transform items 1, 6, 7 and 9. Each got a forward fix (failing test first, `[declared]`
     fix, merge, sync, reload). Each re-check passed, so **nothing was reverted for a live
     failure**.
   - **Restarts.** None in FIX-3.

Live checks touched only ZZ-prefixed scratch actors, scenes, journals and files. Players were
simulated on the GM tab: a socket payload with a ZZ sender, or a `game.user` shadow for one call. No
user was created. The real PCs (Caven, Marrith, Talo) and the campaign scenes were not touched.
Walls is never synced live by an agent.

## Summary

Merge SHAs are on pentaryn `main`, except fork, which is on the fork repo
(`foundry-vtt-mcp`, branch `pentaryn`). "FF" means a forward fix in FIX-3.

| group | merge | gate | live result | forward-fixed / reverted |
|---|---|---|---|---|
| kit (1.2.0) | `bd308f40` | `foundry-modules-check`, `foundry-lib-check` | 7/7 pass (+ KIT-R2 spot check) | — |
| aoe | `95849ce8` | `foundry-aoe-check` 469 | all pass (FIX-2) | — |
| combat-core | `67d575be` | `foundry-combat-check` | 7/7 pass | — |
| combat-hud | `04cede10` | `foundry-combat-check` | 10/10 pass | — |
| py-blueprint | `21736866` | `make test` | 8/8 pass | — |
| cursors | `94fd808f` | `foundry-cursors-check` 68 | 5 pass, rest code only | — |
| dropbin | `79e67749` | `foundry-dropbin-check` | DB-AC-1 failed, 19 pass → re-check pass | FF `092da451` (merges `e7691904`, `cb864ef9`) |
| feedback | `3f8fa54b` | `foundry-feedback-check` 150 | 7/7 pass | — |
| feedback-kit | `ccc61e7f` | `foundry-feedback-check` | 5/5 pass | — |
| importer | `c0734972` | `foundry-importer-check` | AC-2 failed, rest pass → re-check pass | FF `d6f5e9ea` (merges `589cdeb0`, `6e82249b`) |
| journal | `89adc641` | `foundry-journal-check` | 5 pass, 7 code only | — |
| names | `946d5193` | `foundry-names-check` | AC-3 failed → re-check pass | FF `f3176616` (merge `5acca9cb`) |
| portals | `0c9741ba` | `foundry-portals-check` 230 | 10/10 pass | — |
| prompts-core | `ca9324b1` | `foundry-prompts-check` | 4/4 pass (+ cross-tab extra) | — |
| prompts-adapters | `14db0a82` | `foundry-prompts-check` | EC-6 failed (spot check), 9 pass → re-check pass | FF `dd89029f` (merge `7aa95b5e`) |
| py-ops | `c1202ed1` | `make test` | 6/6 pass | — |
| py-cloud | `3b6cf2b3` | `make test` | pass where runnable; rest wait for a shutdown backup | — |
| py-mcp | `97b4cc69` | `make test` | 12 pass; `/mcp` view not run | — |
| py-update | `48b3cbf7` | `make test` | idle checks pass; rest wait for the Saturday run | — |
| ties-core | `f301b4a7` | `foundry-ties-check` | 8/8 pass | — |
| transform | `5da34c34` | `foundry-transform-check` | items 1, 6, 7, 9 failed → re-check pass | FF `81d370b6`, `cc6de518` (merges `61b1bd9e`, `42c9cae6`) |
| walls | `aca4502e` | `foundry-walls-check` 243 | not run (never synced live by an agent) | — |
| fork | fork `8dc6b3d` | fork vitest 319 + 71, typecheck | 5 pass, 8 code only | — |
| attunement | `3a98b06b` | `foundry-attunement-check` | 10/10 pass | — |
| creatures | `43c92942` | `foundry-creatures-check` | 9/9 pass | — |
| lookup | `3526ab5c` | `foundry-lookup-check` 194 | 14 pass, 4 code only | — |
| movement | `860fbfe8` | `foundry-movement-check` 189 | 10 pass, edge-1 code only | — |
| pings | `e8228a89` | `make test` **red** | not deployed | **reverted** `4b1f287c`, parked |
| riders | `a357c0d2` | `foundry-riders-check` 196 | 11/11 pass | kit re-vendor `300acf1f` (see below) |
| ties-study | `3c944d4e` | `foundry-ties-check` 396 | 9/9 pass | — |
| live-goldens | `bb468ffd` | pytest 171 | 9/9 pass, walls not run | — |
| senses | `8a0f74a6`, then `5610c1c6` | `foundry-senses-check` 207 | 7/7 pass | reverted in FIX-2 (`d26ef1db`); FF `8d688ad0`, re-applied `efaf50e8` |
| ties-ui | `7e38887f` | `foundry-ties-check` 474 | 18/18 pass | parked in FIX-2; reconciled `7ca6e0a9`, `de1eeb15` |

Final gates on main after FIX-3: `make test` 2201 passed, `make foundry-modules-check` 20/20,
`make foundry-lib-check` green, `make check-context` OK.

**Riders re-vendor.** The riders branch was cut before kit 1.2.0 and vendored
`lib/election.mjs` at 1.1.0, so the vendor gate failed after the merge. FIX-3 re-vendored it
(`300acf1f`) instead of reverting, so riders runs the same kit 1.2.0 election code as every other
module. Strictly, the rule was revert-and-park. If Joe wants that rule applied, revert `a357c0d2`
and `300acf1f`.

## What changed at the table, by group

**kit (1.2.0).** Every module now carries kit 1.2.0. There is no visible change at the table. Under
the hood:

- A module that is switched off and on again no longer loses or doubles its patch.
- A claim on a deleted document is dropped quietly.
- An unloaded compendium entry says NOT_FOUND ("load it first").
- A broken HUD button logs a warning instead of an anonymous error.
- Player→GM requests fail with a code.
- GM-side relays can see which player asked.

**aoe.** Careful Spell follows Joe's ruling. The sorcerer ticks who it protects (up to CHA
modifier, minimum 1), from creatures they can see. A public card names those tokens. The next save
tray marks exactly them, and the GM can toggle rows. Other changes:

- Cancelling a placement gives back the slot and ends that cast's concentration.
- A tray that is superseded or partly applied can't switch area.
- One monster's failed save no longer stops the others.
- A save with no DC is left for the GM to set.
- In the dark a new area handle gives a faint light and is named "<Spell> (<caster's token>)".
- Two GM tabs no longer both apply damage.

**combat-core.** Stopping a Full Attack works whatever you call the creature (name, token, id,
UUID). A Monk with no Focus sees a greyed Flurry of Blows. Missing weapon sets are written in one
save. Failed saves of Reaction marks or weapon choices now warn. With the floating-text guard Off,
Foundry's own damage numbers run. One bad follow-up call answers "unknown" instead of crashing.

**combat-hud.** Dash, Disengage, Dodge, Hide and Shove behave as before, now from one table, and
Shove still spends an Attack swing. Other changes:

- Death-save failure and massive-damage cards post only after the damage lands. The public card
  speaks as the token.
- With no reach set, Full Attack, follow-ups and Retarget all use the scene's grid size.
- One GM tab handles each turn change.
- Deleting several combats runs one cleanup sweep.
- The HUD does less repeated work, and the bars look the same.

**py-blueprint.** Developer tooling only, nothing at the table. The conformance scorer catches more
real problems: per-call stores, async jobs started from per-frame hooks, `for await` loops, and
imported channel names. A broken file no longer crashes the scorer, and it no longer hides findings
past 12. `new_module --force` keeps a module's own tier and settings.

**cursors.** After a hot-patch uninstall the map pointer stays plain until the module is
re-imported. Map-load errors are logged and the cursor is still repaired. The cursor build checks
every cursor before writing any image.

**dropbin.** Only the active GM writes the drop ledger, and each row carries the pile's own scene.
Other changes:

- A dead linked NPC with several tokens turns into loot in one step, with one Dead overlay.
- Per Joe's ruling, players never open a corpse's sheet. They loot through Item Piles'
  double-click, and the GM is exempt.
- Revive works once and puts ownership back exactly.
- The loot window gains **Loot all**.
- The eye badge ships with the module and no longer asks Item Piles every frame.
- Restores land on the right token's actor, or refuse with `no-actor`.

FIX-3 forward fix: a drop onto empty ground records the new pile's scene and uuid again. One such
drop is now one ledger row instead of a delete row plus a drop row.

**feedback.** Every error message in a report is redacted, not just the error ring. A corrupt
report file is skipped with a warning and no longer breaks the list. Escape closes a dialog that
was reopened while it was closing. "What gets attached" lists everything a report sends. A failed
upload folder is retried on the next report.

**feedback-kit.** A player can no longer ask the GM to file someone else's queued bug reports.
That request is REFUSED.

**importer.** The importer checks every actor entry before it writes anything. One broken entry
refuses the whole run, and nothing changes. Other changes:

- Bad options are refused by name.
- A failed actor shows as its own warning and is no longer also counted as updated.
- The self-test checks every version-gate flag.

FIX-3 forward fix: Foundry 14 silently replaces an actor when a create reuses an id. The importer
now looks the id up first. It never overwrites an actor that holds the id, and it reports "created
concurrently by another GM tab — re-run" or "already held by …".

**journal.** The "Add to my journal" bar appears only once a player can see at least one page. If
the journal window fails to open after a save, the copy is still saved and the success message
still shows. With two GM tabs, only one makes the Player Journals folder and each player's
journal. The API also takes a player's id or name.

**names.** A rename with missing names is refused and blanks nothing. A refused combat-tracker
rename only logs a warning, and the token labels still change. FIX-3 forward fix: two quick renames
of one actor (Bob → Mid → Fin) now end on the last name, with two toasts. Before, the labels stuck
on the middle name.

**portals.** Changes at the table:

- A snapshot that can't be saved keeps the card's old picture and warns.
- A party token deleted while the Teleport confirm is open stays deleted.
- A Large creature lands beside others, never on top of them.
- The card, badge and inspect agree on "revealed".
- An empty party just warns.
- The badge shows a new snapshot without a reload.
- With two GM tabs, only one moves an arriving PC.
- Linking to a region that isn't a landing spot is refused.

**prompts-core.** Two replace runs on the same marker no longer build it twice. If one marker
vanishes mid-replace, the others are still cleaned up. A keypress with no key, or a P that can't
place its marker, no longer swallows the keyboard.

**prompts-adapters.** Changes at the table:

- A failed save keeps the marker and shows an error.
- A double-click on a size chip swaps once, and keys typed during a swap are kept.
- The side panel redraws on note, light, tile, ring-art and prompt-flag changes.
- A spell listed twice is added once.
- On hex maps, crop boxes match the drawn token.
- A failed Delete keeps the box open.

FIX-3 forward fix: two quick opens of the same marker now give one box and no error.

**py-ops.** Tooling only. `make foundry-modules-check` runs about twice as fast with the same
output. Bridge status names every port holder and fails on any orphan. Module installs take a
lock. A direct sync of the importer is refused and points to `importer-install`.

**py-cloud.** Tooling only. Several things that could crash boot, status or upload now fail
cleanly: a junk queued job, a non-UTF-8 cloud file, odd zip folder names, and a Mac Foundry that
ignores the polite quit. Restore refuses to run without a terminal unless `--yes` is given. An
updater rollback writes the same based-on record as a manual restore.

**py-mcp.** Tooling only. The dnd-scripts server keeps serving after a malformed message. It always
negotiates `2025-06-18`. Refused tool calls are logged as `rejected`. File locks give up after 60
s. Every tool has a title, for example "List feedback reports".

**py-update.** Tooling only. Changes:

- Rollback restores the newest backup copy, and an interrupted copy leaves nothing behind.
- A broken registry or a malformed manifest holds that package with a reason instead of a
  traceback.
- Child processes are cleaned up on SIGTERM.
- Exactly one run holds the lock.
- Fork drift is measured against upstream's real default branch.

**ties-core.** Changes:

- "Write an entry" on a kind row saves under the actor's real id.
- A blank DC means 15.
- A refused save warns instead of throwing.
- Parallel attribute links all land.
- An item mark's tooltip is plain text.
- Only one Ties Web macro exists.

**transform.** Each automatic Wild Shape ending runs once, in one tab. Other changes:

- A spent form is swept only after it has been tokenless for over 10 s.
- Compendium wildcard art picks the first matching file.
- A Long Rest during a revert always completes.
- The Bonus bar keeps Return and Change Form at the front.

FIX-3 forward fixes:

- A 0 HP auto-revert no longer collides on Bloodied, so its return line posts.
- A linked form in combat gets Argon action pips, including under pentaryn-combat.
- An unlinked druid's Return item shows the token's own name and art.
- Switching Starry Form constellation ends the Chalice offer.

**walls.** Changes:

- When walls refuses an endpoint, only the GM sees a short local pulse, and nobody's view pans.
- Undo puts moved walls back and peels back one run at a time.
- Hitting the cap commits nothing.
- Each action has one macro.
- Markers draw only on the viewed scene.

None of this has been checked live, because Joe deploys walls himself.

**fork (foundry-vtt-mcp).** Bridge-side only:

- An invalid Date or a typed array from eval-js no longer breaks the result.
- A bad eval timeout falls back to the default.
- A non-boolean `active` on toggle-condition is refused.
- `pentaryn-read` with wrong arguments to `describe` answers BAD_ARGS.

**attunement.** The cap is tracked, never blocking. Attuning past the limit warns once per extra
item, and the counter turns maroon ("1 over the limit"). Other changes:

- A bonded item stashed and returned lights its slot again exactly once.
- An attuned item and a plain one with the same name stay separate.
- A slot drop redraws the sheet once, in the right slot.
- `report("typo")` warns instead of reporting on the selected token.

**creatures.** After a hot-patch uninstall, setting changes do nothing. `list()` and `syncScene()`
take a user or scene by id, uuid or name. An unknown scene fails with NOT_FOUND. One failing scene
no longer stops the others from syncing.

**lookup.** Changes:

- On v14, roll-table rows show their text again.
- Inline rolls lose their brace and `/r` debris.
- An exact monster name in any pack beats a partial match.
- A CR range like "1/2–2" or "CR 1/2 to 2" works.
- Empty or string book and pack options work.
- 2014-pack answers are labelled `edition: "2014"`.
- A failed pack read is skipped and does not break the lookup.

**movement.** The "fight is over" message waits until the fight really ends. Two quick clicks on
the ghost-policy button toast the mode that is really in force. A toggle in one tab reaches the
player's other tab. Pins limited to another level are no longer flagged under a token.

**pings.** Nothing changed at the table. The branch was reverted, so the deployed pings code is the
same as before the wave.

**riders.** Changes:

- A failed concentration save is ended by exactly one tab, and the card says "Failed:
  concentration ended".
- Summoned tokens are removed once, about 1 s after concentration ends.
- Battle Medic installs in one save.
- `spendHitDie("6")` spends a d6.
- An Elemental Affinity type that fits no feature is refused.
- After you click the Actors tab, a summon no longer flips the sidebar back to chat.

**ties-study.** Changes:

- The Deliver dialog no longer holds a claim while it is open.
- A delivered rung-0 lie survives Share and Forget.
- A second look in one combat round warns but still runs.
- Dropping the last belief row leaves no empty flag.
- One Share gives everyone identical text in one batch, and Reset posts one notification.
- The "looks openly paranoid" line stays on the sixth look, per Joe's 2026-08-23 retune.

**live-goldens.** Test tooling only:

- A skipped golden no longer diffs as identical.
- Cleanups run every step and report failures.
- Walls only deletes this GM's chat.
- Known pings noise is declared in `noise/pings.txt`.
- Keys with dots print in brackets.
- One shared tick channel per golden.

**senses.** Changes:

- One Light cast makes one square of light, even with two GM tabs.
- A carried shard's light is applied once and then left alone.
- Senses tooltips show names exactly as typed.
- Light setup saves once per character.
- Torches toggled on an unlinked token and on its world actor don't trample each other.

FIX-3 forward fix: the shard keeps its 3 light settings, and a doused torch keeps its flicker.

**ties-ui.** Changes:

- Pressing 5 on a hidden NPC opens only that entry.
- Quick word and stance edits both stick.
- Notes autosave once, 0.7 s after typing stops.
- The review window repaints once.
- A pinned card dragged to the corner stays there.
- Mark as learned grants to your assigned character and names them.
- A deleted character's belief row is tagged "(deleted)".
- Inspect cards toggle on a second press.
- Failed buttons come back with "That didn't go through — see the console."
- Fix it repairs a broken ancestry.

## Still open

**Parked, reverted or not run.**

- **pings is parked.** `make test` fails
  `test_live_golden_pings.py::test_golden_itself_still_runs[hidden]`
  (`scratchRecordsInLog` 0, expected 1) on the pings branch alone. The group record never ran
  `make test`. The branch `fix2/pings-2026-10-12` still has the work, but its record did not
  survive the revert onto main.
- **The riders re-vendor needs Joe's call:** keep `300acf1f`, or apply the strict rule (see
  above).
- **walls has had no live check.** Joe deploys it. The steps are in [`walls.md`](walls.md). The
  py-update dry run also reports that `pentaryn-walls` in `Data/` differs from the repo at the same
  version.
- **The fork record is missing.** There is no `fork.md` in this folder or in the fork repo. The
  live check was worked from the fork CHANGELOG. Running Claude sessions keep the old MCP wrapper
  until they restart (rob-6, edge-7).
- **py-mcp:** Joe needs to run `/mcp` reconnect `dnd-scripts` once in each open session. The
  servers that are running predate the merge.
- **Not run, waiting on an event:**
  - py-update rollback and report items wait for the next Saturday 04:06 run.
  - py-cloud items wait for the next shutdown backup and the next interactive boot.
  - transform item 6 with pentaryn-combat disabled was not run, because it needs a module
    toggle.
  - transform wildcard art through the player relay was not run.
  - journal async-1, EC-4 and rob-2 need a second GM tab or a scratch user.
  - Code-only items in every group are covered by their gates.

**Defects seen live, not fixed in this wave.**

- dropbin: a drop onto an *existing* pile still writes a delete row and a drop row, because Item
  Piles gives the item a new id.
- dropbin: when a linked corpse's last token is deleted, its base actor keeps the Item Piles pile
  flag and the Dead status. The next token is then born a pile that dropbin doesn't manage.
- importer: on the update path, an invalid change (such as a blank name) is dropped by Foundry but
  counted as updated and hash-stamped, so it is never retried. Two creates sent in the same
  instant still leave one actor holding the later tab's (identical) data.
- combat: calling `game.pentaryn.combat.inspect(actor, null)` directly throws an uncoded TypeError
  (`combat/api.mjs:54`). `api.plan` still scans weapons for a Multiattack actor before its check,
  so it throws when an item's properties are not iterable, which only happens in memory. The
  massive-damage GM whisper uses the actor name.
- aoe: deleting a damage card after the 750 ms settle but mid-resolve logs one swallowed console
  error.
- cursors: `api.refresh()` is not gated by the `installed` flag.
- portals: v14 deprecation warnings (`Scene#background`, the `teleport` update option). An empty
  `claims {}` is left on an arriving token.
- transform: after a 0 HP auto-revert, the druid's HP is 0 because dnd5e mirrors the form's HP.
  This is existing behaviour.
- ties-ui: the GM-only belief row prints authored lore HTML as literal text
  (`authoring-ui.mjs:103`). This predates the wave.
- lookup: a 2014 SRD spell uuid answers `onList: false` for its class list, because the registry
  holds the 2024 copy.
- Argon (not ours, never edited):
  - its `createItem` hook throws on a world item;
  - its special-action cards use the actor name;
  - its HUD disabled itself once after a scene grid change.

**Record wording to correct.**

- `kit.md`'s names-ext-3 step should expect a toast count of 3, not 2.
- `ties-ui.md` E4 step 1 conflicts with the declared toggle.
- `riders.md` async-5 should run `setType` before `retireManual`.
- `attunement.md` EXT-8: the selftest detail lists only the missing hooks.
- py-cloud: the PERF-1 and M4 tests are in `test_review_fixes.py`.
- py-ops: `make foundry-module-index --check` swallows `--check`, and EXT-6 refuses at argparse.
- py-update ROB-4: upstream's default branch is `master`.
- ties-study M5: if Joe actually wants the paranoid line on the tenth look, it is a one-line
  threshold change.

**GM tab state.** creatures and movement run hot re-imported copies, and transform ran one during
its check. A dropbin perf-1 probe left a pass-through wrapper on
`game.itempiles.API.isItemPileEmpty`. A normal reload clears all of this.

**Needs Joe.**

- Accept the **Argon (enhancedcombathud-dnd5e) 5.2.3 update** dialog. It is left alone for Joe.
- **BOSS go-live.** The Mac stays `FROM=local` until Joe says he has moved.
- After a normal session, **delete `pre-bundles-2026-10/` and `system-backup/`**.
- **Report the Foundry 14.369 first-token-change bug** upstream.
- Glance at the cloud state after the next shutdown backup: 20 local bundles are not yet uploaded,
  36 are unreferenced, and there is only one mac snapshot (keep is 10).

## Exit state

Foundry is up on world `pentaryn` with one GM tab (Gamemaster) answering `get-world-info`. Main is
pushed. Rollback copies of the live modules are in `.state/live-rollback/FIX-2/` and
`.state/live-rollback/FIX-3/`.
