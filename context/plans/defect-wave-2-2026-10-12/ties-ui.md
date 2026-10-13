# Defect wave 2 (2026-10-12): ties-ui (pentaryn-ties)

**Read this when:** you want the history of defect wave 2 for the ties UI (`pentaryn-ties`: the Ties, Known and Attributes sheet tabs, the tie dialog, cards and wires, the Look, Inspect and Attribute Review windows). It records what was fixed, why, and how to check it live. It is history, not instructions.

Source record: [`final-review-2026-10-12/`](../final-review-2026-10-12/) (the ties-ui findings). Branch `fix2/ties-ui-2026-10-12`.
Gate: `make foundry-ties-check` is green. The vendored kit is identical to `foundry/lib`. Conformance is 96.1 % (49/51), with two accepted exceptions (C05 and C37, both already in `exceptions.json`).

Every item is a DECLARED behaviour change with a line under the CHANGELOG `Unreleased` header. Joe approved the wave on 2026-10-12. Where Joe gave no ruling the recommendation was taken, within his standing principles: track rather than block, prefer native, and treat console-only output as fine. No item was reverted: every committed item holds.

## Items

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| ties-ui-E2 | Opening a hidden Known entry (key 5 / `known.open`) did nothing visible | Recommendation | Only that entry is un-hidden and shown open, even if the sheet was already open. Other hidden entries stay hidden. | `6acbcc83` | `test/known-open-hidden.test.mjs` |
| ties-ui-M2 | The stance chip lost its chip look because filter buttons shared `.pt-chip` | Recommendation | Filter and tab buttons now use `pt-filter-chip`. On a narrow sheet the stance chip shrinks to the dot again. | `6eb602c4` | `test/filter-chip.test.mjs` + goldens |
| ties-ui-ACC-3 | A second quick edit (pip, remove, Known) could undo the first while the first was still saving | Recommendation | Each actor's ties and Known writes are queued, so both edits stick. | `3b48ed87` | `test/write-queue.test.mjs` |
| ties-ui-EXT-2 | The actor-delete sweep hard-coded which sheet tabs to clear | Recommendation | Each sheet tab declares `forget(actorId)`, and the delete loops over `SHEET_TABS`. No change at the table. | `c7396b9f` | `test/session-maps.test.mjs` |
| ties-ui-EXT-3 | Ties notes saved twice, and the last keystrokes could be lost on blur | Recommendation | Ties and Known share one autosave: 0.7 s after typing stops, plus a flush when you click away. Each note is saved once. | `6e56ff67` | `test/notes-autosave-shared.test.mjs` |
| ties-ui-EXT-4 | The Look window and the Player view had two heading tables, and an unknown fact kind fell under "What they are" | Recommendation | One `GROUP_LABEL` table. An unknown kind is headed with its own name. | `b43c4268` | `test/group-label.test.mjs` |
| ties-ui-ACC-2 | A share switch clicked during a Player view redraw acted on a half-built view | Recommendation | The view is built aside and swapped in after the last await. | `919c398b` | `test/player-view-race.test.mjs` |
| ties-ui-perf-2 | The Attributes tab scanned every actor once per personal attribute | Recommendation | One carrier map per redraw. The output is identical. | `ca456e13`, `ce467b8c` | `test/attrs-personal-paint.test.mjs` |
| ties-ui-perf-5 | Attribute Review repainted once per registry write | Recommendation | One repaint, 150 ms after the last write. | `abe229fc` | `test/review-coalesce.test.mjs` |
| ties-ui-E5 | A card pinned at the screen edge came back 20px in | Recommendation | It comes back at the edge. | `02b90ecf` | `test/review-ties-ui-pinned.test.mjs` |
| ties-ui-M11 | On an NPC's Attributes tab, drawing and clicking used different viewers | Recommendation | Both use your assigned character. Mark as learned grants to them and the toast names them. With no assigned character, no button is drawn. | `0968e9e0` | `test/review-ties-ui-viewer.test.mjs` |
| ties-ui-rob-4 | A deleted character's belief row could not be cleared | Recommendation | The row is tagged "(deleted)" and has no Deliver button. Reset clears it, and the reset message names no one. | `744d0d4e` | `test/review-ties-ui-orphan-belief.test.mjs` |
| ties-ui-E4 | Pressing 9 twice quickly opened two description cards | Recommendation | One card opens. A second press on the same face closes it, and a press on a different face switches the card to that creature. | `cf94caac` | `test/review-ties-ui-describe-race.test.mjs` |
| ties-ui-M9 | Inspect preview with no token returned the warning object | Recommendation | It shows the warning and returns `null`. | `c9ff0634` | `test/review-ties-ui-preview-null.test.mjs` |
| ties-ui-M6 | The overlay had an unused `toggle` alias of `showAll` | Recommendation | The alias is removed. The API is otherwise unchanged. | `c1d06ee3` | `test/review-ties-ui-toggle-alias.test.mjs` |
| ties-ui-ACC-5 | Attribute Review repainted per change and kept listening after it closed | Recommendation | It repaints once after 150 ms, and the hooks are released on close (covered by the perf-5 commit). | `abe229fc` | `test/review-coalesce.test.mjs` |
| ties-ui-M5 | Four unused re-exports, and popups imported its helper twice | Recommendation | These were dropped. | `2a4b6c8e` | `test/review-ties-ui-reexports.test.mjs` |
| ties-ui-M7 | Editing a lore row also fired a tie save | Recommendation | The tie change handler skips lore-editor rows. | `2e8d8f71` | `test/review-ties-ui-lore-rows.test.mjs` |
| ties-ui-M8 | Uninstall left badges, wires and cards on screen, and a re-install drew the pinned cards twice | Recommendation | Uninstall clears the layers, queued frames and cards but leaves the saved pins alone. A re-install draws one copy. | `7e2c5b83` | `test/review-ties-ui-uninstall.test.mjs` |
| ties-ui-M12 | `TieDialog._renderHTML` was one large function | Recommendation | It is split into private builders. The markup is byte-identical. | `141c1572` | `test/review-ties-ui-render-builders.test.mjs` |
| ties-ui-M14 | Shared bits (key label, summary binding, fallback art, opening the tie dialog) were duplicated | Recommendation | Each now has one home in `core/html.mjs` (plus one `openTieDialog`). | `9f280da3` | `test/review-ties-ui-shared-helpers.test.mjs` |
| ties-ui-rob-5 | An un-awaited pin save and Look render failed anonymously | Recommendation | These now log a `pentaryn-ties \| …` console error. Nothing changes on screen. | `f4d0ded9` | `test/review-ties-ui-unawaited.test.mjs` |
| ties-ui-rob-6 | Five catch fallbacks swallowed errors silently | Recommendation | The fallbacks are unchanged. With Ties debug on, each failure also logs a line. | `bbefc48f` | `test/review-ties-ui-swallow.test.mjs` |
| ties-ui-rob-7 | A failed HUD eye or a failed Study, Lore, Mark-as-learned, Tell or Release left the button dead | Recommendation | `guardClick` re-enables the button, shows "That didn't go through — see the console." and logs the error. A finished inspection no longer leaves the eye greyed out. | `e9ea1f6d` | `test/review-ties-ui-guard-click.test.mjs` |
| ties-ui-EXT-5 | Filter chips, state tags and review "was" rows were hand-listed | Recommendation | Each is derived from one label table. The output is identical. | `0f63f8b8` | `test/review-ties-ui-label-tables.test.mjs` |
| ties-ui-EXT-6 | Two copies of the "is this attribute Personal" check | Recommendation | One `isPersonalEntry` in `core/rules.mjs`. It still ignores case and spaces. | `877c3e3c` | `test/review-ties-ui-personal-rule.test.mjs` |
| ties-ui-EXT-7 | DC boxes hard-coded 1–40 with a default of 15 | Recommendation | They read `LORE_DC_MIN/MAX/DEFAULT`. The values are the same. | `e116fa35` | `test/review-ties-ui-dc-bounds.test.mjs` |
| ties-ui-EXT-8 | Skill dropdowns differed, and a missing skill silently switched to the first one | Recommendation (prefer native) | One `skillOptionsHTML` lists skills in dnd5e order with localized names. A missing skill stays selected as "\<key> (not in this world)". | `0af5bc65` | `test/review-ties-ui-skill-options.test.mjs` + goldens |
| ties-ui-EXT-9 | Wires and badges had separate frame and layer plumbing | Recommendation | They share one `framePainter` and one `interfaceLayer`/`dropLayer` pair. Nothing changes visually. | `661412f2` | `test/review-ties-ui-frame-layers.test.mjs` |
| ties-ui-EXT-10 | The HUD eye and the "Take a closer look" menu item had two code paths | Recommendation | Both call one `examine()` and one `subjectOfToken()`. | `6d0f6c6e` | `test/review-ties-ui-examine-door.test.mjs` |
| ties-ui-EXT-11 | The tie keys and the sheet tabs had separate access gates, and a player was let through before settings loaded | Recommendation | Both use one `mayActOn(actor)`. A player is turned away until the settings load. | `b7962863` | `test/review-ties-ui-may-act-on.test.mjs` |
| ties-ui-EXT-13 | The Inspect preview hard-coded the study ladder | Recommendation | It reads `STUDY_RUNGS`/`STUDY_BASE_DC` (15/20/25, with a pass at 15). | `a3d03577` | `test/review-ties-ui-study-ladder.test.mjs` |
| ties-ui-EXT-15 | Four copies of the "GM only" badge markup | Recommendation | One `gmBadge()`. The look is the same. | `c19bbb7c` | `test/review-ties-ui-gm-badge.test.mjs` |
| ties-ui-EXT-16 | Clicking the flask twice stacked Inspect windows | Recommendation | One `openOrFront()`: a second click brings the window to the front and refreshes it. The editor, Review and Look windows reopen the same way. | `1bb90230` | `test/review-ties-ui-open-or-front.test.mjs` |
| ties-ui-E7 | A player with no assigned character got no double-click menu | Recommendation (never block) | The menu shows the tie and notebook items, and the notebook item warns. The Look items appear once a character is assigned. | `f47c4b55` | `test/review-ties-ui-no-character-menu.test.mjs` |
| ties-ui-E9 | A body-only re-render added an extra hidden tab-click handler each time | Recommendation | The nav links are bound once and find their section at click time. | `4e18eee4` | `test/review-ties-ui-nav-bind-once.test.mjs` |
| ties-ui-ACC-4 | "Fix it" on broken ancestry wrote one update per parent | Recommendation | It does one update and is disabled while that update runs. The tab redraws once. | `982743c0` | `test/review-ties-ui-repair-all.test.mjs` |
| ties-ui-ACC-6 | A write from the bridge tab could silently overwrite a field just saved in Review | Recommendation | Your save is re-applied once. On a same-field clash their value stays and your row shows the reload banner. | `107a8ad1` | `test/review-ties-ui-registry-stamp.test.mjs` + goldens |
| ties-ui-perf-4 | The wire painter scanned for each card's source token | Recommendation | One pass per frame. The look is the same. | `1f7d36cc` | `test/review-ties-ui-wire-scan.test.mjs` |
| ties-ui-perf-6 | The GM autocompletes rescanned the world on every letter | Recommendation | Results show on focus, then refresh about 0.1 s after typing pauses. The world is walked once per focus. | `46149866` | `test/review-ties-ui-search-debounce.test.mjs` |
| ties-ui-perf-7 | The Known tab re-sorted the attribute list for each creature | Recommendation | The list is indexed once per repaint. | `b8bc1d1f` | `test/perf-scans.test.mjs` |
| ties-ui-perf-9 | The Look window processed every actor update | Recommendation | It checks the actor id first and only works for the viewer, the subject and its kind. | `98166a16` | `test/live-hooks.test.mjs` |
| ties-ui-perf-10 | Every token step requested a badge frame, and a hot re-import lost the badges until canvasReady | Recommendation | A frame is requested only for marked tokens. After a ready-world re-import, `worn.install` refills the marked set and repaints at once. A normal load is unchanged. | `1bfd3d5c`, `48573164` | `test/review-ties-ui-worn-marked.test.mjs`, `test/review-ties-ui-worn-hot.test.mjs` |
| ties-ui-perf-11 | Opening or closing a Review row re-read every actor | Recommendation | The carrier walk is cached until an actor is created, changed or deleted. | `94b105ef` | `test/review-ties-ui-carriers-cache.test.mjs` |

## Integration with ties-core (FIX-3, 2026-10-13)

Run FIX-2 parked this branch: ties-core was already merged and deployed on main, and merging the
two broke two tests. FIX-3 merged `origin/main` (`d26ef1db`) into this branch as `7ca6e0a9`.
**ties-core's contract wins**, because it is live. Gate: `make foundry-ties-check` green on the merge
and on the follow-up.

| id | defect | ruling | what changed (plain words) | commits | test |
|---|---|---|---|---|---|
| rob-7 x R8 | ties-core R8 made `markLearned` answer `writeFailed` instead of throwing. The rob-7 guard only caught throws, so a refused Mark as learned showed nothing | ties-core's contract wins. The player sees the same thing a throw showed | `guardClick` treats a `{ ok: false, reason: "writeFailed" }` answer as a failure: it logs `pentaryn-ties \| <action>` and shows "That didn't go through — see the console.", and the button comes back on. Mark as learned, Tell them and Fix it return their write's answer to it. A refused Mark as learned shows no "learned" toast. One difference from the throw path: the handler repaints the tab (`rerender()`) before it returns the refused answer, where a throw skipped that. The repaint is invisible, and the toast, log and button state are the same. | `7ca6e0a9`, `23878ece` (CHANGELOG) | `test/review-ties-ui-guard-click.test.mjs` |
| EC-2 x ACC-3/ACC-6 | ties-core's concurrent-ensure test failed after the merge | Both hold | `ensure` behaves correctly. The failure was not a queue interaction: the test helper was reading ties-ui-ACC-6's `{ stamp }` element as an entry, so it now skips it, as every in-module reader does (`readRegistry`/`indexRegistry`; `study/resolve.mjs` passes its raw array only to those). A raw `game.settings.get("pentaryn-ties", "attributes")` in an ad-hoc eval does see that extra row; attribute-review.md now says to read with `api.attributes.list()`. | `7ca6e0a9`, FIX-3 follow-up (docs) | `test/review-ensure-race.test.mjs` |
| ACC-4 x U3 | Fix it (`repairAllAncestry`) read the link flags outside ties-core's registry queue, so a Fix it racing a script's link could lose one of them | Use ties-core's queue | Fix it now runs in the registry queue, like link, unlink and repair. The registry queue and each actor's ties/Known queue are separate chains that never wait on each other, so neither can reorder or deadlock the other. | `23878ece` | `test/review-queues-together.test.mjs`: both queues at once on one actor, and an actor-queue edit that awaits Fix it and an ensure while a link and the same ensure race it on the registry queue. Both tests fail on `7ca6e0a9`'s `attributes.mjs` (a link or Fix it write is lost). They run on real timers (`bootWorld({ timers: false })`), so the 2000 ms deadlock timer fires: with the two queues sharing one chain the second test fails with "deadlock: … did not settle in 2000 ms" in about 2 s. |
| ext-7 x EXT-13 | Both branches replaced the preview's literal pass line, ties-core with `kindPassed` and ties-ui with `STUDY_BASE_DC` | ties-core's rule wins | The preview uses `kindPassed(k.tier)`. The EXT-13 test now checks for that. The numbers are the same. | `7ca6e0a9` | `test/review-ties-ui-study-ladder.test.mjs` |
| M11 x ACC-3 | ties-core's `setNotes` returns false on a refused write, while ties-ui routed it through the queued `editTie` | Both hold | `editTie` returns `null` when `write()` returns false, so `setNotes` stays false and the editor skips its repaint. | `7ca6e0a9` | `test/review-write-refused.test.mjs`, `test/write-queue.test.mjs` |
| ext-8 x EXT-16 | Both branches edited the `describe()` return strings | Each keeps its own row | `attributes.stale` uses ties-core's shape. `attributes.openReview` uses `AttributeReview\|null` from EXT-16, because it returns the window directly. | `7ca6e0a9` | `describe` golden (unchanged by the merge) |
| U2 x ACC-6 | ties-core documents cross-tab registry writes as last-write-wins. ties-ui added a stamp that re-applies the overwritten write | Both are true | The `writeChain` comment and the attribute-review Gotchas say the second write wins at the setting, and that the stamp then re-applies the overwritten tab's change once. | `7ca6e0a9` | `test/review-queue-per-tab.test.mjs` |

No golden changed in the integration. No new player-visible string: the failure toast is the existing
`PENTARYN_TIES.notify.clickFailed`.

## Goldens changed

All changes are under `foundry/module/pentaryn-ties/test/golden/`.

- **M2** (`6eb602c4`): the filter and tab buttons gain the `pt-filter-chip` class. Goldens: `app-review-controls`, `app-review-html`, `app-review-open-controls`, `app-review-open-html`, `glue-sheet-gm`, `ui-attrs-html`, `ui-attrs-pc-controls`.
- **EXT-3** (`6e56ff67`): the Ties notes no longer bind an extra `change` save. Goldens: `app-editor-controls`, `ui-ties-npc-controls`, `ui-ties-pc-controls`.
- **perf-2** (`ca456e13`): new pin `ui-attrs-personal-html`, recorded before the hoist and unchanged by it.
- **M11** (`0968e9e0`): the viewer is the assigned character, and no button is drawn without one. Goldens: `ui-attrs-html`, `ui-attrs-npc-controls`, `ui-attrs-pc-controls`, `ui-attrs-personal-html`.
- **rob-4** (`744d0d4e`): the deleted-belief row. Goldens: `app-editor-controls`, `describe`.
- **M9** (`c9ff0634`): the refusal now returns `null`. Golden: `app-open-refusals`.
- **M12** (`141c1572`): new pin `app-tie-dialog-states-html`, byte-identical across the split.
- **rob-7** (`e9ea1f6d`): HUD clicks go through `guardClick`. Golden: `glue-token-hud-clicks-gm`.
- **EXT-8** (`0af5bc65`): skill options are in dnd5e order with localized labels. Goldens: `app-editor-controls`, `app-editor`, `app-preview`, `app-review-open-html`, `ui-attrs-html`, `ui-attrs-npc-controls`, `ui-attrs-pc-controls`, `ui-attrs-personal-html`, `ui-known-controls`, `ui-known-html`, `ui-ties-npc-controls`, `ui-ties-npc-html`.
- **EXT-16** (`1bb90230`): `openOrFront`. Goldens: `describe`, `glue-token-hud-clicks-gm`.
- **ACC-6** (`107a8ad1`): the registry write stamp. Goldens: `app-review-controls`, `app-review-open-controls`, `attr-boot-repair`, `attr-links`, `attr-review`, `attr-writes`, `ui-attrs-npc-controls`, `ui-attrs-pc-controls`.
- **perf-10** (`1bfd3d5c`): the badge refresh is gated to marked tokens. Goldens: `describe`, `hooks-after-init`.

The `player-look-open` and `app-preview-controls` goldens are byte-identical (EXT-4). `glue-look-menu` is byte-identical too (EXT-10).

## Deploy

Shipped files changed only in `foundry/module/pentaryn-ties/`: `.mjs` files, `styles/ties.css` and `lang/en.json`. Compared with main, `module.json` and `lib/` are unchanged. Per blueprint §10, `.mjs`, `.css` and `lang/*.json` need a **reload**, not a restart (corrected in FIX-3; this section used to say restart). No `scripts/**` or fork changes.

## Live check after deploy

Use only ZZ-prefixed scratch documents: `ZZ Tie PC`, `ZZ Tie NPC`, `ZZ Tie Ghost` and the scene `ZZ Name Leak`. Never use Caven, Marrith, Talo or a campaign scene. Use one GM tab only, and delete the scratch documents afterwards. Items not listed below are code only (covered by the tests above).

**ties-ui-E2**
1. On ZZ Tie PC's Known tab, hide the ZZ Tie NPC entry.
2. With the sheet closed, hover ZZ Tie NPC's token on ZZ Name Leak and press 5. Then press 5 again with the sheet already open on Known. Expect: both times the ZZ Tie NPC row is expanded with its notes focused, and the other hidden entries stay hidden.

**ties-ui-M2**
1. Open ZZ Tie PC's Ties tab in a narrow sheet. Expect: a tie's stance chip is dot-only with no border.
2. Open Attribute Review. Expect: the All/Needs/Selected chips still look like pill buttons.

**ties-ui-ACC-3**
1. On ZZ Tie PC's Ties tab, change a tie's word and then its stance within 300 ms. Reopen the sheet. Expect: both values persisted.

**ties-ui-EXT-3**
1. On ZZ Tie PC's Ties tab, type into a tie's notes and click away within half a second. Reopen the sheet. Expect: the last words are saved.

**ties-ui-perf-5 / ACC-5**
1. With Attribute Review open, run three `attributes.update` calls back to back from eval. Expect: one repaint, with the rows and scroll position intact.

**ties-ui-E5**
1. Pin a card from ZZ Tie PC's web and drag it to the top-left corner (0,0).
2. Reload. Expect: the card comes back at the corner, not 20px in.

**ties-ui-M11**
1. Assign ZZ Tie PC to the GM user. Open ZZ Tie NPC's Attributes tab and click Mark as learned on an authored attribute lore row. Expect: the fact lands in ZZ Tie PC's granted flag and the toast names ZZ Tie PC.
2. Unassign afterwards.

**ties-ui-rob-4**
1. Create ZZ Tie Ghost and roll a lore fact for it on ZZ Tie NPC.
2. Delete ZZ Tie Ghost. Expect: on ZZ Tie NPC's Ties tab the belief row shows "(deleted)" with no Deliver button.
3. Click Reset. Expect: the row is removed from the beliefs flag.

**ties-ui-E4**
1. Hover ZZ Tie NPC's token and press 9 twice within about 100 ms. Expect: never more than one card is open, and no card is open afterwards (the second press on the same face closes the card the first one opened).
2. Press 9 once. Expect: exactly one card opens. Press 9 again. Expect: the card closes.

**ties-ui-rob-7**
1. On ZZ Name Leak as GM, stub the GM-side inspect handler to throw (eval), then click the inspect eye on ZZ Tie NPC's HUD. Expect: the button re-enables, the toast reads "That didn't go through — see the console.", and the console error line starts with `pentaryn-ties`.
2. Remove the stub.

**ties-ui-EXT-9**
1. On ZZ Name Leak, press 8 on ZZ Tie PC and pan. Expect: the wires follow.
2. Mark a ZZ token worn. Expect: the badge appears and follows the token.

**ties-ui-EXT-16**
1. Click the flask on ZZ Tie NPC's HUD twice. Expect: one Inspect window, brought to the front on the second click.

**ties-ui-ACC-4**
1. On ZZ Tie NPC, link an attribute, then delete its parent's link by eval so the banner shows.
2. Click Repair once. Expect: one update and the banner is gone.

**ties-ui-perf-10**
1. On ZZ Name Leak, mark one ZZ token worn and move another. Expect: the badge stays put.
2. Move the marked token. Expect: the badge follows.
3. Drop a new worn-flagged ZZ token. Expect: its badge appears.

**FIX-3 integration (rob-7 x R8, ACC-4 x U3)**
1. Create `ZZ Tie PC`, `ZZ Tie NPC` and three registry entries: `ZZ City`, `ZZ Ward` (parent ZZ City, with one lore row) and `ZZ Other`. Link `ZZ Ward` to ZZ Tie NPC and assign ZZ Tie PC to the GM user.
2. Mark as learned, refused: in eval, make ZZ Tie PC's writes fail on that one instance: `const pc = game.actors.getName("ZZ Tie PC"); pc.update = () => Promise.reject(new Error("zz refused"));`. A `preUpdateActor` hook returning `false` will not do, because Foundry then skips the update without an error. On ZZ Tie NPC's Attributes tab, click Mark as learned on ZZ Ward's row. Expect: the button comes back on, an error toast "That didn't go through — see the console.", no "learned" toast, and in the console the warning `pentaryn-ties | mark as learned failed` followed by the error `pentaryn-ties | attr-learned`. Run `delete pc.update`, click again, and expect the normal "learned" toast that names ZZ Tie PC.
3. Fix it: open ZZ Tie NPC's sheet on the Attributes tab. In eval, set `flags.pentaryn-ties.attributes` to `["zzward"]` (the ward without its parent) so the broken-ancestry banner shows. Then, in one eval, click the sheet's `[data-action="attr-repair"]` button and call `game.modules.get("pentaryn-ties").api.attributes.link(npc, "ZZ Other")` in the same tick. Expect: both writes land, the flag carries `zzward`, every ancestor of it and the linked entry, and the banner is gone.
4. Concurrent ensure: in eval, run `Promise.all([A.ensure("ZZ Tide"), A.ensure("ZZ Tide")])`. Expect one `existed: false`, one `existed: true` and a single ZZ Tide entry. While it runs, change a tie's word and then its strength on ZZ Tie PC's Ties tab, and expect both to stick.
5. Delete ZZ Tide, ZZ Other, ZZ Ward, ZZ City and the ZZ actors, and unassign ZZ Tie PC.

## Live check result (FIX-3, 2026-10-13 ~07:50Z)

This ran on main `915e1f54` in the one GM tab. The served `pentaryn-ties` files are sha-identical to
the repo. The tab was loaded at 07:13Z, after the deploy, and it already holds the FIX-3 code
(`isWriteFailed` is exported, and `ties.css` has `pt-filter-chip`), so no reload was needed. The
scratch documents were named `ZZ ties-ui …` in place of `ZZ Tie …`: PC, NPC, Other, Third, Ghost,
the scene `ZZ ties-ui Scene` (viewed only, never activated) and the registry entries City, Ward,
Other and Tide. All of them were deleted afterwards. The GM's assigned character is back to none,
the pinned-cards memo is back to `[]`, and the five study/inspect chat cards the run made were
deleted. The tab was hidden, so canvas frames ran only while a screenshot was being taken. For that
reason, wire and badge geometry was read after a rendered frame.

- **E2: pass.** Three Known entries were hidden. With the sheet closed, pressing 5 on the NPC opened
  Known with only that row un-hidden and expanded, and its notes focused. The NPC was then re-hidden
  and the open sheet repainted, so the row was gone. Pressing 5 again had the same result. Other and
  Third stayed hidden both times.
- **M2: pass, with one caveat.** The dnd5e sheet will not go below 800px, so the Ties container was
  540px wide and its stance chips kept their border and label. With the container held at 460px, the
  chip had `border: none`, `padding: 0` and a hidden label, and its dot stayed. The sheet's filter
  buttons are `pt-filter-chip`. In Attribute Review the All, Needs review and Selected chips (and the
  Global and Personal tabs) are pills: `border-radius: 999px` with a 1px border, which a screenshot
  confirms.
- **ACC-3: pass.** The word was changed to `partner`, and 120 ms later the stance was changed to Wary.
  After a close and reopen, both had persisted.
- **EXT-3: pass.** Notes were typed and the field was blurred 200 ms after the last input. There was
  exactly 1 `updateActor` ties write, and after a reopen the last words (`…ZZLAST`) were saved.
- **perf-5 / ACC-5: pass.** With Review open and its window scrolled to 120, three
  `attributes.update` calls gave 1 `render()` call and 1 render hook. There were 31 rows before and
  after, and the scroll position stayed at 120. After close, `live.watching` is false and a further
  update causes 0 renders.
- **E5: pass. The reload was simulated**, because reloading the tab was not allowed. A card dragged
  to the corner saved `{ x: 0, y: 0 }`. Then `popups.teardown()` and `restorePinned()` ran, which is
  the reload's restore path. The card came back at `left: 0px; top: 0px`. `pinnedCoord(0)` is 0, and
  `pinnedCoord(null)` is 20.
- **M11: pass.** With no assigned character, the NPC's Attributes tab drew no Mark as learned button,
  even with the PC token selected. After the PC was assigned, the button appeared. A click wrote
  `attr:zztiesuiward:zzwardlore` into the PC's `granted` flag, and the toast read "ZZ ties-ui PC has
  learned “ZZ ties-ui ward lore”."
- **rob-4: pass.** The Ghost (a character) rolled the NPC's lore row, and then the Ghost was deleted.
  The belief row shows `(deleted)` and has only a "Let them roll again" button, with no Deliver. That
  button's confirmation reads "That character was deleted. Clear what they believed about ZZ ties-ui
  NPC?". Yes cleared `flags.pentaryn-ties.beliefs` entirely.
- **E4: pass, but the step's wording is wrong.** Pressing 9 twice quickly on the NPC rendered 1
  card, and the second press closed it. At most 1 card was ever open, and 0 were open afterwards.
  That is the declared behaviour ("a second press on the same face closes it"). Step 1's expectation
  of "exactly one card is open" after two presses does not match it. A single press opened 1 card,
  and the next press closed it.
- **rob-7: pass.** The GM-side handler is an ES-module binding, so an eval cannot stub it. In its
  place, the inspector's `getFlag` was made to throw on that one ZZ instance. The eye was disabled
  during the click and enabled after it. The toast read "That didn't go through — see the
  console.", and the console error was `pentaryn-ties | inspect Error: zz inspect stub`. The stub was
  then removed.
- **EXT-9: pass.** After 8 was pressed on the PC, the transient cards moved with the pan. The pinned
  card's wire ran from the corner card to the Other token before and after the pan (its end moved
  with the token from (762, 339) to (988, 490)). The worn badge appeared on the marked token and
  followed it.
- **EXT-16: pass.** Two flask clicks made 1 `InspectPreview`, the same instance both times. The
  second click raised it from z 116 to 118, above a sheet at 117.
- **ACC-4: pass.** With `["zztiesuiward"]` the banner showed. Repair caused 1 `updateActor`, the
  button was disabled during it, and the flag became `[ward, city]` with no banner.
- **perf-10: pass.** Moving the unmarked Other left the badge at (583, 317). Moving the marked NPC
  moved the badge to (683, 517). A token created with the worn flag already set got its own badge at
  (383, 717).
- **FIX-3 rob-7 x R8: pass.** With `pc.update` rejecting, Mark as learned gave the error toast "That
  didn't go through — see the console." and no learned toast. The console showed `pentaryn-ties |
  mark as learned failed` and then `pentaryn-ties | attr-learned Error: writeFailed`, and the button
  came back on. After `delete pc.update`, the learned toast named ZZ ties-ui PC (the M11 result
  above).
- **FIX-3 ACC-4 x U3: pass.** A Fix it click and `attributes.link(npc, "ZZ ties-ui Other")` ran in the
  same tick. The flag became `["zztiesuiward","zztiesuicity","zztiesuiother"]`, `broken()` returned
  `[]` and the banner was gone.
- **FIX-3 EC-2 x ACC-3: pass.** `Promise.all` of two `ensure("ZZ ties-ui Tide")` calls returned one
  `existed: false` and one `existed: true`, with a single Tide entry. During them, a tie's word was
  changed to `nemesis` and its strength to 5 (a pip click), and both stuck.

One thing outside this group: a GM belief row on the Ties tab prints authored HTML as text (it
shows `<p>…</p>`), because `authoring-ui.mjs` escapes `row.text`. This is GM-only and existed
before wave 2; it was not fixed here.
